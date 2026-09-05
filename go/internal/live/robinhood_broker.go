package live

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"mktorder.com/go/internal/robinhood"
)

type RobinhoodBroker struct {
	Svc     *robinhood.Service
	Call    func(name string, args map[string]any) (json.RawMessage, error)
	account string
}

func (b *RobinhoodBroker) tool(name string, args map[string]any) (json.RawMessage, error) {
	return b.toolCtx(context.Background(), name, args)
}

// toolCtx is tool with an explicit context, threaded down from
// PlaceMarketCfg's cfg.Ctx so a T-1 order's MCP calls are bounded by the same
// close-of-session deadline as the placement itself. The test/simulator hook
// (b.Call) predates context plumbing and stays ctx-less — it never talks to a
// real network. See P1-1 in AUTOTRADE_ROADMAP.md.
func (b *RobinhoodBroker) toolCtx(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
	if b != nil && b.Call != nil {
		return b.Call(name, args)
	}
	if b == nil || b.Svc == nil {
		return nil, fmt.Errorf("robinhood not connected")
	}
	return b.Svc.CallToolCtx(ctx, name, args)
}

func NewRobinhoodBroker(svc *robinhood.Service) *RobinhoodBroker {
	return &RobinhoodBroker{Svc: svc}
}

func (b *RobinhoodBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	return b.PlaceMarketCfg(symbol, side, qty, PlaceMarketCfg{})
}

func (b *RobinhoodBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	ctx := cfg.ctx()
	ref := strings.TrimSpace(cfg.ClientOrderID)
	if ref == "" {
		ref = newRefID()
	} else {
		ref = asUUID(ref)
	}
	acct, err := b.agenticAccount()
	if err != nil {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	qtyStr := integerQty(qty)
	if strings.EqualFold(side, "SELL") {
		qtyStr = formatOrderQuantity(qty)
	}
	args := map[string]any{
		"account_number": acct,
		"symbol":         symbol,
		"side":           strings.ToLower(side),
		"type":           "market",
		"quantity":       qtyStr,
		"time_in_force":  "gfd",
		"market_hours":   "regular_hours",
		"ref_id":         ref,
	}
	if _, err := b.toolCtx(ctx, "get_equity_tradability", map[string]any{"account_number": acct, "symbols": []string{symbol}}); err != nil {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	review, err := b.toolCtx(ctx, "review_equity_order", args)
	if err != nil {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	if blockingReview(robinhood.ToolContentJSON(review)) {
		err = fmt.Errorf("blocking review alert")
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	raw, err := b.toolCtx(ctx, "place_equity_order", args)
	if err != nil {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	detail := mapFromJSON(robinhood.ToolContentJSON(raw))
	// The MCP call succeeding is not proof the order was accepted: check the
	// body it returned. No recognizable order in the response (no id/state at
	// all) means we cannot say what happened — report ambiguous rather than
	// submitted, and let the caller decide how to resolve it. See P0-6 in
	// AUTOTRADE_ROADMAP.md.
	if !recognizableRobinhoodOrder(detail) {
		return OrderResult{
			ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty,
			Ambiguous: true,
			Error:     "place_equity_order response did not contain a recognizable order",
		}, nil
	}
	status := NormalizeOrderStatus(robinhoodOrderStatus(detail))
	if status == "rejected" || status == "cancelled" {
		return OrderResult{
			ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty,
			Status: status, Error: fmt.Sprintf("order %s by Robinhood: %s", status, robinhoodOrderStatus(detail)),
		}, nil
	}
	if status == "unknown" {
		status = "submitted"
	}
	return OrderResult{
		Submitted: true, ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty,
		Status: status, FilledPrice: fillPriceFrom(detail), FilledQty: fillQtyFrom(detail),
	}, nil
}

// recognizableRobinhoodOrder reports whether a place_equity_order response
// body identifies an order at all (an id or a state/status field). An empty
// or unrelated body must not be read as a successful submission.
func recognizableRobinhoodOrder(detail map[string]any) bool {
	if detail == nil {
		return false
	}
	return first(detail, "ref_id", "id", "order_id", "client_order_id", "state", "status") != nil
}

func (b *RobinhoodBroker) CloseMarket(symbol string) (OrderResult, error) {
	pos, err := b.Positions()
	if err != nil {
		return OrderResult{}, err
	}
	qty := PositionQuantity(pos, symbol)
	if qty == 0 {
		return OrderResult{Error: "no position"}, fmt.Errorf("no position")
	}
	return b.PlaceMarket(symbol, "SELL", qty)
}

func (b *RobinhoodBroker) Account() (map[string]any, error) {
	acct, err := b.agenticAccount()
	if err != nil {
		return nil, err
	}
	raw, err := b.tool("get_portfolio", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	p := mapFromJSON(robinhood.ToolContentJSON(raw))
	cash := asFloat(first(p, "cash", "cash_balance", "settled_cash"))
	bp := asFloat(first(p, "buying_power", "cash_buying_power"))
	nlv := asFloat(first(p, "equity", "market_value", "portfolio_value", "total_value"))
	return map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": cash, "day_buying_power": bp, "net_liquidation_value": nlv,
	}}}}, nil
}

func (b *RobinhoodBroker) Positions() ([]any, error) {
	acct, err := b.agenticAccount()
	if err != nil {
		return nil, err
	}
	raw, err := b.tool("get_equity_positions", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	var root any
	_ = json.Unmarshal(robinhood.ToolContentJSON(raw), &root)
	var out []any
	collectPositions(root, &out)
	return out, nil
}

func (b *RobinhoodBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	acct, err := b.agenticAccount()
	if err != nil {
		return nil, err
	}
	raw, err := b.tool("get_equity_orders", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	var root any
	_ = json.Unmarshal(robinhood.ToolContentJSON(raw), &root)
	want := asUUID(clientOrderID)
	found := findOrder(root, want)
	if found == nil {
		return nil, fmt.Errorf("%w: %s", ErrOrderUnavailable, want)
	}
	st := robinhoodOrderStatus(found)
	found["status"] = st
	return found, nil
}

func (b *RobinhoodBroker) OpenOrders() ([]any, error) {
	return b.ordersByState(false)
}

func (b *RobinhoodBroker) OrderHistory(start, end string) ([]any, error) {
	return b.ordersByState(true)
}

func (b *RobinhoodBroker) ordersByState(all bool) ([]any, error) {
	acct, err := b.agenticAccount()
	if err != nil {
		return nil, err
	}
	raw, err := b.tool("get_equity_orders", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	var root any
	_ = json.Unmarshal(robinhood.ToolContentJSON(raw), &root)
	var out []any
	collectOrders(root, &out)
	if all {
		return out, nil
	}
	var open []any
	for _, o := range out {
		m, _ := o.(map[string]any)
		st := NormalizeOrderStatus(robinhoodOrderStatus(m))
		if !IsFinalOrderStatus(st) {
			open = append(open, o)
		}
	}
	return open, nil
}

func (b *RobinhoodBroker) CancelOrder(clientOrderID string) error {
	id := asUUID(clientOrderID)
	if _, err := uuid.Parse(id); err != nil {
		return fmt.Errorf("cancel order_id is not a UUID: %q", clientOrderID)
	}
	acct, err := b.agenticAccount()
	if err != nil {
		return err
	}
	_, err = b.tool("cancel_equity_order", map[string]any{"account_number": acct, "order_id": id})
	return err
}

func (b *RobinhoodBroker) CreateToken() (map[string]any, error) {
	return nil, fmt.Errorf("robinhood uses oauth")
}
func (b *RobinhoodBroker) CheckToken(token string) (map[string]any, error) {
	return nil, fmt.Errorf("robinhood uses oauth")
}
func (b *RobinhoodBroker) Calendar() ([]byte, error) { return nil, fmt.Errorf("not webull") }
func (b *RobinhoodBroker) CalendarDays(start, end string) ([]map[string]any, error) {
	return nil, fmt.Errorf("not webull")
}
func (b *RobinhoodBroker) RawSplits(symbol string) ([]map[string]any, error) {
	return nil, fmt.Errorf("not webull")
}

func (b *RobinhoodBroker) agenticAccount() (string, error) {
	if b.account != "" {
		return b.account, nil
	}
	if b.Svc != nil && b.Svc.DB != nil {
		if acct := strings.TrimSpace(b.Svc.DB.GetRobinhoodOAuth().AccountNumber); acct != "" {
			b.account = acct
			return acct, nil
		}
	}
	raw, err := b.tool("get_accounts", nil)
	if err != nil {
		return "", err
	}
	var root any
	_ = json.Unmarshal(robinhood.ToolContentJSON(raw), &root)
	acct := findAgentic(root)
	if acct == "" {
		return "", fmt.Errorf("Agentic Account не подключён")
	}
	b.account = acct
	if b.Svc != nil && b.Svc.DB != nil {
		_ = b.Svc.DB.SaveRobinhoodAccount(acct)
	}
	return acct, nil
}

func integerQty(qty float64) string {
	n := int64(math.Floor(qty + 1e-9))
	if n < 1 {
		n = 1
	}
	return strconv.FormatInt(n, 10)
}

func asUUID(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "-") {
		return s
	}
	if len(s) == 32 {
		return s[0:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:]
	}
	return s
}

func newRefID() string {
	return robinhood.NewRefID()
}

func blockingReview(raw []byte) bool {
	s := strings.ToLower(string(raw))
	if strings.Contains(s, `"blocking":true`) || strings.Contains(s, `"severity":"block"`) {
		return true
	}
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return false
	}
	return walkBlocking(root)
}

func walkBlocking(v any) bool {
	switch t := v.(type) {
	case map[string]any:
		if asBool(t["blocking"]) || strings.EqualFold(fmt.Sprint(t["severity"]), "block") {
			return true
		}
		for _, c := range t {
			if walkBlocking(c) {
				return true
			}
		}
	case []any:
		for _, c := range t {
			if walkBlocking(c) {
				return true
			}
		}
	}
	return false
}

func findAgentic(v any) string {
	switch t := v.(type) {
	case map[string]any:
		if asBool(t["agentic_allowed"]) {
			for _, k := range []string{"account_number", "accountNumber", "number"} {
				if s := strings.TrimSpace(fmt.Sprint(t[k])); s != "" && s != "<nil>" {
					return s
				}
			}
		}
		for _, c := range t {
			if s := findAgentic(c); s != "" {
				return s
			}
		}
	case []any:
		for _, c := range t {
			if s := findAgentic(c); s != "" {
				return s
			}
		}
	}
	return ""
}

func collectPositions(v any, out *[]any) {
	switch t := v.(type) {
	case map[string]any:
		if t["symbol"] != nil && (t["quantity"] != nil || t["qty"] != nil) {
			qty := asFloat(first(t, "quantity", "qty"))
			mv := asFloat(first(t, "market_value", "marketValue", "value"))
			*out = append(*out, map[string]any{"symbol": t["symbol"], "quantity": qty, "market_value": mv})
			return
		}
		for _, c := range t {
			collectPositions(c, out)
		}
	case []any:
		for _, c := range t {
			collectPositions(c, out)
		}
	}
}

func collectOrders(v any, out *[]any) {
	switch t := v.(type) {
	case map[string]any:
		if t["ref_id"] != nil || t["id"] != nil || t["order_id"] != nil {
			*out = append(*out, t)
			return
		}
		for _, c := range t {
			collectOrders(c, out)
		}
	case []any:
		for _, c := range t {
			collectOrders(c, out)
		}
	}
}

func findOrder(v any, ref string) map[string]any {
	var orders []any
	collectOrders(v, &orders)
	for _, o := range orders {
		m, _ := o.(map[string]any)
		if m == nil {
			continue
		}
		id := strings.TrimSpace(fmt.Sprint(first(m, "ref_id", "id", "order_id", "client_order_id")))
		if id == ref || asUUID(id) == ref {
			return m
		}
	}
	return nil
}

func robinhoodOrderStatus(detail map[string]any) string {
	if detail == nil {
		return ""
	}
	raw := strings.ToLower(strings.TrimSpace(fmt.Sprint(first(detail, "state", "status"))))
	return MapRobinhoodOrderState(raw)
}

func MapRobinhoodOrderState(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "new", "queued", "confirmed", "unconfirmed":
		return "working"
	case "partially_filled":
		return "partially_filled"
	case "filled":
		return "filled"
	case "cancelled", "canceled":
		return "cancelled"
	case "rejected":
		return "rejected"
	case "failed":
		return "rejected"
	case "voided":
		return "cancelled"
	default:
		return raw
	}
}

func mapFromJSON(raw []byte) map[string]any {
	var m map[string]any
	if json.Unmarshal(raw, &m) == nil {
		return m
	}
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return map[string]any{}
	}
	if found := findFirstMap(root); found != nil {
		return found
	}
	return map[string]any{}
}

func findFirstMap(v any) map[string]any {
	switch t := v.(type) {
	case map[string]any:
		return t
	case []any:
		for _, c := range t {
			if m := findFirstMap(c); m != nil {
				return m
			}
		}
	}
	return nil
}

func first(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}
