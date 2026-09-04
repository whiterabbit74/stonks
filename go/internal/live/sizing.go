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

// minEntryReservePct is the hard floor for the entry sizing reserve, applied
// to every capital mode (P1-6). A quote read at T-1 and an order filled a
// moment later rarely trade at the exact same price; without a reserve the
// margin modes size to the last cent of buying power and the broker rejects
// the order for insufficient funds right when there is no time left to retry.
const minEntryReservePct = 0.005

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

// capitalModeConfig resolves the buying-power multiplier and the effective
// entry reserve for the configured capital mode. The reserve is never below
// minEntryReservePct, never below the operator-configured entryReservePct,
// and never below maxSlippageBps expressed as a fraction: the slippage
// threshold used to be reported only, now it also floors the reserve it
// warns about (P1-6, ties into P2-4).
func capitalModeConfig(autoTrading map[string]any) (multiplier, reservePct float64) {
	mode := ""
	if autoTrading != nil {
		mode = fmt.Sprint(autoTrading["entryCapitalMode"])
	}
	cfg, ok := capitalModes[mode]
	if !ok {
		cfg = capitalModes["standard_safe"]
	}
	reservePct = cfg.reservePct
	if reservePct < minEntryReservePct {
		reservePct = minEntryReservePct
	}
	if autoTrading != nil {
		if configured := asFloat(autoTrading["entryReservePct"]); configured > reservePct {
			reservePct = configured
		}
		if slippage := asFloat(autoTrading["maxSlippageBps"]) / 10000; slippage > reservePct {
			reservePct = slippage
		}
	}
	return cfg.multiplier, reservePct
}

// extractEntryFundsFromBalance reports the buying power an entry may use.
// Orders go out in the regular session, so day buying power leads and the
// overnight figures are only fallbacks for accounts that do not report it.
func extractEntryFundsFromBalance(root map[string]any) float64 {
	if root == nil {
		return 0
	}
	asset := preferredAsset(root)
	var cands []any
	if asset != nil {
		cands = []any{asset["day_buying_power"], asset["overnight_buying_power"], asset["night_trading_buying_power"], asset["option_buying_power"], asset["cash_balance"], asset["net_liquidation_value"]}
	}
	cands = append(cands, root["total_cash_balance"], root["cash_balance"], root["total_net_liquidation_value"], root["net_liquidation_value"])
	return firstPositive(cands...)
}

func extractCashBalance(root map[string]any) float64 {
	if root == nil {
		return 0
	}
	asset := preferredAsset(root)
	var cands []any
	if asset != nil {
		cands = []any{asset["cash_balance"], root["total_cash_balance"], root["cash_balance"]}
	} else {
		cands = []any{root["total_cash_balance"], root["cash_balance"]}
	}
	return firstPositive(cands...)
}

func extractNetLiquidation(root map[string]any) float64 {
	if root == nil {
		return 0
	}
	asset := preferredAsset(root)
	var cands []any
	if asset != nil {
		cands = []any{asset["net_liquidation_value"], root["total_net_liquidation_value"], root["net_liquidation_value"]}
	} else {
		cands = []any{root["total_net_liquidation_value"], root["net_liquidation_value"]}
	}
	return firstPositive(cands...)
}

func extractEntryBaseCapital(root map[string]any) float64 {
	if cash := extractCashBalance(root); cash > 0 {
		return cash
	}
	return extractNetLiquidation(root)
}

func positionMarketValue(m map[string]any) float64 {
	return firstPositive(m["market_value"], m["marketValue"], m["market_val"], m["marketValueUsd"], m["last_value"])
}

func sumPositionMarketValues(positions []any) (sum float64, ok bool) {
	ok = true
	for _, row := range positions {
		m := mapOf(row)
		if m == nil {
			continue
		}
		qty := firstPositive(m["quantity"], m["qty"], m["position"], m["holding"], m["total_qty"], m["totalQuantity"])
		if qty <= 0 {
			continue
		}
		v := positionMarketValue(m)
		if v <= 0 {
			return 0, false
		}
		sum += v
	}
	return sum, true
}

var errBuyingPowerNotABase = fmt.Errorf("no residual cash for entry (buying power is not a sizing base)")

func resolveEntryBalanceSizing(balancePayload any, autoTrading map[string]any, positions []any, posErr error) (entryFunds, buyingPower, baseCapital float64, err error) {
	root := unwrapBalance(balancePayload)
	buyingPower = extractEntryFundsFromBalance(root)
	cash := extractCashBalance(root)
	if cash > 0 {
		baseCapital = cash
	} else {
		if posErr != nil {
			return 0, buyingPower, 0, fmt.Errorf("positions unavailable: %w", posErr)
		}
		mv, ok := sumPositionMarketValues(positions)
		if !ok {
			return 0, buyingPower, 0, fmt.Errorf("position market value missing")
		}
		baseCapital = extractNetLiquidation(root) - mv
	}
	if !(baseCapital > 0) {
		return 0, buyingPower, baseCapital, errBuyingPowerNotABase
	}
	multiplier, _ := capitalModeConfig(autoTrading)
	entryFunds = baseCapital * multiplier
	if buyingPower > 0 && entryFunds > buyingPower {
		entryFunds = buyingPower
	}
	return entryFunds, buyingPower, baseCapital, nil
}

func EntryFunds(balancePayload any, autoTrading map[string]any) float64 {
	funds, _, _, _ := resolveEntryBalanceSizing(balancePayload, autoTrading, nil, nil)
	return funds
}

func ComputeOrderQuantity(currentPrice float64, autoTrading map[string]any, availableFunds float64) (float64, error) {
	if !(currentPrice > 0) {
		return 0, fmt.Errorf("Invalid market price for quantity calculation")
	}
	if autoTrading == nil {
		autoTrading = map[string]any{}
	}
	// One sizing rule: spend the entry funds the capital profile allows. Fixed
	// share counts and fixed notionals used to be selectable here and had
	// nothing to do with the strategy being traded.
	if !(availableFunds > 0) {
		return 0, fmt.Errorf("Unable to read available funds for balance sizing")
	}
	_, reservePct := capitalModeConfig(autoTrading)
	// The reserve is subtracted from availableFunds before sizing, not divided
	// into it, so the invariant qty*price <= availableFunds*(1-reservePct)
	// holds exactly once flooring only ever rounds the quantity down further.
	usableFunds := availableFunds * (1 - reservePct)
	if usableFunds < 0 {
		usableFunds = 0
	}
	quantity := usableFunds / currentPrice
	// Whole shares only. Fractional entries were a switch; they are not what
	// this strategy trades, and a fractional order is a different order type at
	// the broker with its own fill rules.
	quantity = math.Floor(quantity)
	if !(quantity > 0) {
		return 0, fmt.Errorf("Calculated order quantity is zero; increase funds or reduce price")
	}
	return quantity, nil
}

// PositionQuantity is how much of the symbol the broker actually holds, exactly
// as reported. An exit sells this whole number: entries are whole shares, but a
// split can still leave a fraction, and flooring it here would sell 7 of 7.5
// and call the position closed with the rest still open.
func PositionQuantity(positions []any, symbol string) float64 {
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
		return q
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

func (e *Engine) sizeOrder(action, symbol string, cfg map[string]any, price float64, br Broker) (float64, error) {
	if action == "exit" {
		if br == nil {
			return 0, fmt.Errorf("Webull credentials are missing")
		}
		pos, err := retryBrokerRead(e, "positions", br.Positions)
		if err != nil {
			return 0, err
		}
		q := PositionQuantity(pos, symbol)
		if !(q > 0) {
			return 0, fmt.Errorf("No broker position found for %s", symbol)
		}
		return q, nil
	}
	if br == nil {
		return 0, fmt.Errorf("Unable to read available funds for balance sizing")
	}
	acct, err := retryBrokerRead(e, "account", br.Account)
	if err != nil {
		return 0, err
	}
	var pos []any
	var posErr error
	if extractCashBalance(unwrapBalance(acct)) <= 0 {
		pos, posErr = retryBrokerRead(e, "positions", br.Positions)
	}
	funds, _, _, serr := resolveEntryBalanceSizing(acct, cfg, pos, posErr)
	if serr != nil {
		return 0, serr
	}
	return ComputeOrderQuantity(price, cfg, funds)
}
