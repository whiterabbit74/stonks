package live

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"mktorder.com/go/internal/store"
)

var capitalModes = map[string]struct {
	multiplier float64
	reservePct float64
}{
	"standard_safe": {1, 0.022},
	"cash_100":      {1, 0},
	"margin_125":    {1.25, 0},
	"margin_150":    {1.5, 0},
	"margin_175":    {1.75, 0},
	"margin_200":    {2, 0},
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f
	}
	return 0
}

func asBool(v any) bool {
	switch n := v.(type) {
	case bool:
		return n
	case string:
		return n == "true" || n == "1"
	}
	return false
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func unwrapBalance(v any) map[string]any {
	m := mapOf(v)
	if m == nil {
		return nil
	}
	if inner := mapOf(m["balance"]); inner != nil {
		m = inner
	}
	if inner := mapOf(m["data"]); inner != nil {
		m = inner
	}
	return m
}

func firstPositive(vals ...any) float64 {
	for _, v := range vals {
		if f := asFloat(v); f > 0 {
			return f
		}
	}
	return 0
}

func preferredAsset(root map[string]any) map[string]any {
	if root == nil {
		return nil
	}
	assets, _ := root["account_currency_assets"].([]any)
	var usd, first map[string]any
	for _, a := range assets {
		m := mapOf(a)
		if m == nil {
			continue
		}
		if first == nil {
			first = m
		}
		if strings.ToUpper(fmt.Sprint(m["currency"])) == "USD" {
			usd = m
			break
		}
	}
	if usd != nil {
		return usd
	}
	return first
}

func capitalModeConfig(autoTrading map[string]any) (multiplier, reservePct float64) {
	mode := ""
	if autoTrading != nil {
		mode = fmt.Sprint(autoTrading["entryCapitalMode"])
	}
	cfg, ok := capitalModes[mode]
	if !ok {
		cfg = capitalModes["standard_safe"]
	}
	return cfg.multiplier, cfg.reservePct
}

func extractEntryFundsFromBalance(root map[string]any, autoTrading map[string]any) float64 {
	if root == nil {
		return 0
	}
	asset := preferredAsset(root)
	session := ""
	if autoTrading != nil {
		session = strings.ToUpper(fmt.Sprint(autoTrading["supportTradingSession"]))
	}
	var cands []any
	if asset != nil {
		if session == "N" {
			cands = []any{asset["night_trading_buying_power"], asset["overnight_buying_power"], asset["day_buying_power"], asset["option_buying_power"], asset["cash_balance"], asset["net_liquidation_value"]}
		} else {
			cands = []any{asset["day_buying_power"], asset["overnight_buying_power"], asset["night_trading_buying_power"], asset["option_buying_power"], asset["cash_balance"], asset["net_liquidation_value"]}
		}
	}
	cands = append(cands, root["total_cash_balance"], root["cash_balance"], root["total_net_liquidation_value"], root["net_liquidation_value"])
	return firstPositive(cands...)
}

func extractEntryBaseCapital(root map[string]any) float64 {
	if root == nil {
		return 0
	}
	asset := preferredAsset(root)
	var cands []any
	if asset != nil {
		cands = []any{asset["cash_balance"], root["total_cash_balance"], root["cash_balance"], asset["net_liquidation_value"], root["total_net_liquidation_value"], root["net_liquidation_value"]}
	} else {
		cands = []any{root["total_cash_balance"], root["cash_balance"], root["total_net_liquidation_value"], root["net_liquidation_value"]}
	}
	return firstPositive(cands...)
}

func resolveEntryBalanceSizing(balancePayload any, autoTrading map[string]any) (entryFunds, buyingPower, baseCapital float64) {
	root := unwrapBalance(balancePayload)
	buyingPower = extractEntryFundsFromBalance(root, autoTrading)
	baseCapital = extractEntryBaseCapital(root)
	multiplier, _ := capitalModeConfig(autoTrading)
	multiplierBase := baseCapital
	if !(multiplierBase > 0) {
		multiplierBase = buyingPower
	}
	if multiplierBase > 0 {
		entryFunds = multiplierBase * multiplier
	} else {
		entryFunds = buyingPower
	}
	if buyingPower > 0 && entryFunds > buyingPower {
		entryFunds = buyingPower
	}
	return entryFunds, buyingPower, baseCapital
}

func EntryFunds(balancePayload any, autoTrading map[string]any) float64 {
	funds, _, _ := resolveEntryBalanceSizing(balancePayload, autoTrading)
	return funds
}

func ComputeOrderQuantity(currentPrice float64, autoTrading map[string]any, availableFunds float64) (float64, error) {
	if !(currentPrice > 0) {
		return 0, fmt.Errorf("Invalid market price for quantity calculation")
	}
	if autoTrading == nil {
		autoTrading = map[string]any{}
	}
	mode := strings.ToLower(fmt.Sprint(autoTrading["entrySizingMode"]))
	if mode == "" || mode == "<nil>" {
		mode = strings.ToLower(fmt.Sprint(autoTrading["sizingMode"]))
	}
	if mode == "" || mode == "<nil>" {
		mode = "balance"
	}
	_, reservePct := capitalModeConfig(autoTrading)
	headroom := 1 + reservePct
	var quantity float64
	switch mode {
	case "quantity":
		quantity = asFloat(autoTrading["fixedQuantity"])
	case "notional":
		quantity = asFloat(autoTrading["fixedNotionalUsd"]) / currentPrice
		if capUSD := asFloat(autoTrading["maxPositionUsd"]); capUSD > 0 {
			capQty := capUSD / currentPrice
			if capQty < quantity {
				quantity = capQty
			}
		}
	default:
		if !(availableFunds > 0) {
			return 0, fmt.Errorf("Unable to read available funds for balance sizing")
		}
		quantity = (availableFunds / headroom) / currentPrice
	}
	if !asBool(autoTrading["allowFractionalShares"]) {
		quantity = math.Floor(quantity)
	} else {
		quantity = math.Floor(quantity*100000) / 100000
	}
	if !(quantity > 0) {
		return 0, fmt.Errorf("Calculated order quantity is zero; increase funds or reduce price")
	}
	return quantity, nil
}

func PositionQuantity(positions []any, symbol string, fractional bool) float64 {
	want := store.SafeTicker(symbol)
	for _, row := range positions {
		m := mapOf(row)
		if m == nil {
			continue
		}
		cand := store.SafeTicker(firstString(m, "symbol", "ticker", "display_symbol"))
		if cand != want {
			continue
		}
		q := firstPositive(m["quantity"], m["qty"], m["position"], m["holding"], m["total_qty"], m["totalQuantity"])
		if q <= 0 {
			return 0
		}
		if fractional {
			return math.Floor(q*100000) / 100000
		}
		return math.Floor(q)
	}
	return 0
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func quotePrice(ev EvalResult, symbol string) float64 {
	for _, q := range ev.Quotes {
		if store.SafeTicker(fmt.Sprint(q["symbol"])) == store.SafeTicker(symbol) {
			if p := asFloat(q["currentPrice"]); p > 0 {
				return p
			}
		}
	}
	return 0
}

func (e *Engine) sizeOrder(action, symbol string, cfg map[string]any, price float64) (float64, error) {
	if action == "exit" {
		if e.Broker == nil {
			return 0, fmt.Errorf("Webull credentials are missing")
		}
		pos, err := e.Broker.Positions()
		if err != nil {
			return 0, err
		}
		q := PositionQuantity(pos, symbol, asBool(cfg["allowFractionalShares"]))
		if !(q > 0) {
			return 0, fmt.Errorf("No broker position found for %s", symbol)
		}
		return q, nil
	}
	mode := strings.ToLower(fmt.Sprint(cfg["entrySizingMode"]))
	if mode == "" || mode == "<nil>" {
		mode = "balance"
	}
	funds := 0.0
	if mode == "balance" {
		if e.Broker == nil {
			return 0, fmt.Errorf("Unable to read available funds for balance sizing")
		}
		acct, err := e.Broker.Account()
		if err != nil {
			return 0, err
		}
		funds = EntryFunds(acct, cfg)
	}
	return ComputeOrderQuantity(price, cfg, funds)
}
