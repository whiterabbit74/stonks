package live

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"mktorder.com/go/internal/robinhood"
	"mktorder.com/go/internal/tradingdate"
)

type RobinhoodBroker struct {
	Svc     *robinhood.Service
	Call    func(name string, args map[string]any) (json.RawMessage, error)
	CallCtx func(ctx context.Context, name string, args map[string]any) (json.RawMessage, error)

	// mu guards account: the dashboard handler clears the cache on ?refresh=1
	// while the scheduler resolves it from its own goroutine (AUD-054).
	mu      sync.Mutex
	account string
}

func (b *RobinhoodBroker) cachedAccount() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.account
}

func (b *RobinhoodBroker) setAccount(acct string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.account = acct
}

func (b *RobinhoodBroker) tool(name string, args map[string]any) (json.RawMessage, error) {
	return b.toolCtx(context.Background(), name, args)
}

// toolCtx is tool with an explicit context, threaded down from PlaceMarketCfg
// and the ctx* reads so a T-1 MCP call is bounded by the close-of-session
// deadline. Call is the ctx-less test hook; CallCtx is the spy that receives
// the caller context. See P1-1 in AUTOTRADE_ROADMAP.md.
func (b *RobinhoodBroker) toolCtx(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
	if b != nil && b.CallCtx != nil {
		return b.CallCtx(ctx, name, args)
	}
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
	if qty <= 0 {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: "quantity must be positive"}, fmt.Errorf("quantity must be positive")
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
	// review_equity_order's schema is additionalProperties:false and has no
	// ref_id — that id belongs to place_equity_order alone. Sending the place
	// arguments verbatim made every review fail with "unexpected additional
	// properties [ref_id]", so no Robinhood order could ever be placed.
	reviewArgs := make(map[string]any, len(args))
	for k, v := range args {
		if k == "ref_id" {
			continue
		}
		reviewArgs[k] = v
	}
	review, err := b.toolCtx(ctx, "review_equity_order", reviewArgs)
	if err != nil {
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	if blockingReview(robinhood.ToolContentJSON(review)) {
		err = fmt.Errorf("blocking review alert")
		return OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	raw, err := b.toolCtx(ctx, "place_equity_order", args)
	if err != nil {
		res := OrderResult{ClientOrderID: ref, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}
		if strings.Contains(strings.ToLower(err.Error()), "unauthorized") {
			res.Ambiguous = true
			return res, nil
		}
		return res, err
	}
	detail := robinhoodOrderBody(robinhood.ToolContentJSON(raw), ref)
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
	// Robinhood's order listing has no ref_id field, so the id we generated
	// cannot find the order again: every later poll answered
	// ErrOrderUnavailable and the tracker sat in execution_unknown alerting on
	// every cycle. Remember the broker's own order id while we still have it.
	b.rememberOrderID(ref, detail)
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

// robinhoodOrderBody digs the order object out of a place_equity_order
// response. The tool wraps its payload ({"data": {...}, "guide": "..."}), so
// reading the top-level map found no id: the order id was never remembered and
// every later poll answered ErrOrderUnavailable until an operator confirmed
// the fill by hand.
func robinhoodOrderBody(raw []byte, ref string) map[string]any {
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return map[string]any{}
	}
	if m := findOrder(root, asUUID(ref)); m != nil {
		return m
	}
	var orders []any
	collectOrders(root, &orders)
	for _, o := range orders {
		if m, _ := o.(map[string]any); m != nil {
			return m
		}
	}
	if m, _ := root.(map[string]any); m != nil {
		return m
	}
	return map[string]any{}
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
	return b.AccountCtx(context.Background())
}

func (b *RobinhoodBroker) AccountCtx(ctx context.Context) (map[string]any, error) {
	acct, err := b.agenticAccountCtx(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := b.toolCtx(ctx, "get_portfolio", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	p := portfolioBody(mapFromJSON(robinhood.ToolContentJSON(raw)))
	cash := money(first(p, "cash", "cash_balance", "settled_cash", "uninvested_cash"))
	unsettled := money(first(p, "unsettled_funds", "unsettled_cash"))
	bp := money(first(p, "buying_power", "cash_buying_power"))
	nlv := money(first(p, "total_value", "equity", "market_value", "portfolio_value"))
	return map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": cash, "unsettled_cash": unsettled,
		"day_buying_power": bp, "net_liquidation_value": nlv,
	}}}}, nil
}

// portfolioBody unwraps the get_portfolio envelope: the MCP tool answers
// {"data": {...}, "guide": "..."} and the money fields live one level down.
func portfolioBody(p map[string]any) map[string]any {
	if inner, ok := p["data"].(map[string]any); ok {
		return inner
	}
	return p
}

// money reads a portfolio money field. Robinhood returns them as strings and
// sometimes as an object wrapping the same name ("buying_power":
// {"buying_power": "3446.92"}).
func money(v any) float64 {
	if m, ok := v.(map[string]any); ok {
		return asFloat(first(m, "buying_power", "amount", "value", "total", "cash"))
	}
	return asFloat(v)
}

func (b *RobinhoodBroker) Positions() ([]any, error) {
	return b.PositionsCtx(context.Background())
}

func (b *RobinhoodBroker) PositionsCtx(ctx context.Context) ([]any, error) {
	acct, err := b.agenticAccountCtx(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := b.toolCtx(ctx, "get_equity_positions", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	var root any
	// An unreadable answer is not an empty portfolio: collectPositions would
	// return no rows and the entry path would read that as flat, opening a
	// second position on top of one we hold (AUD-026 class).
	if err := json.Unmarshal(robinhood.ToolContentJSON(raw), &root); err != nil {
		return nil, fmt.Errorf("unreadable positions response from Robinhood: %w", err)
	}
	var out []any
	collectPositions(root, &out)
	return out, nil
}

// rememberOrderID stores the order id Robinhood assigned to our ref_id, taken
// from the place_equity_order response.
func (b *RobinhoodBroker) rememberOrderID(ref string, detail map[string]any) {
	if b == nil || b.Svc == nil || b.Svc.DB == nil || detail == nil {
		return
	}
	id := strings.TrimSpace(fmt.Sprint(first(detail, "id", "order_id")))
	if id == "" || id == "<nil>" || id == ref {
		return
	}
	if err := b.Svc.DB.SaveRobinhoodOrderRef(ref, id, time.Now().UTC().Format(time.RFC3339)); err != nil {
		// Losing this mapping means the order can never be polled again by our
		// own id, so it must not disappear silently.
		_ = b.Svc.DB.AppendAutotradeLog("brokerRaw event=robinhood_order_ref_save_failed refId=" + ref + " orderId=" + id + " error=" + err.Error())
	}
}

func (b *RobinhoodBroker) brokerOrderID(ref string) string {
	if b == nil || b.Svc == nil || b.Svc.DB == nil {
		return ""
	}
	return b.Svc.DB.RobinhoodOrderID(ref)
}

func (b *RobinhoodBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	return b.OrderDetailCtx(context.Background(), clientOrderID)
}

func (b *RobinhoodBroker) OrderDetailCtx(ctx context.Context, clientOrderID string) (map[string]any, error) {
	acct, err := b.agenticAccountCtx(ctx)
	if err != nil {
		return nil, err
	}
	want := asUUID(clientOrderID)
	args := map[string]any{"account_number": acct}
	// Listing rows are keyed by Robinhood's own order id; ours only exists in
	// the place response, which is where rememberOrderID stored it. With that
	// id ask for the single order instead of scanning a capped first page.
	brokerID := b.brokerOrderID(want)
	if brokerID != "" {
		args["order_id"] = brokerID
	}
	raw, err := b.toolCtx(ctx, "get_equity_orders", args)
	if err != nil {
		return nil, err
	}
	var root any
	if err := json.Unmarshal(robinhood.ToolContentJSON(raw), &root); err != nil {
		return nil, fmt.Errorf("%w: unreadable order detail from Robinhood: %v", ErrOrderUnavailable, err)
	}
	found := findOrder(root, want)
	if found == nil && brokerID != "" {
		found = findOrder(root, brokerID)
	}
	if found == nil {
		return nil, fmt.Errorf("%w: %s", ErrOrderUnavailable, want)
	}
	st := robinhoodOrderStatus(found)
	found["status"] = st
	return found, nil
}

func (b *RobinhoodBroker) OpenOrders() ([]any, error) {
	return b.OpenOrdersCtx(context.Background())
}

func (b *RobinhoodBroker) OpenOrdersCtx(ctx context.Context) ([]any, error) {
	return b.ordersByState(ctx, false)
}

func (b *RobinhoodBroker) OrderHistory(start, end string) ([]any, error) {
	return b.OrderHistoryCtx(context.Background(), start, end)
}

func (b *RobinhoodBroker) OrderHistoryCtx(ctx context.Context, start, end string) ([]any, error) {
	acct, err := b.agenticAccountCtx(ctx)
	if err != nil {
		return nil, err
	}
	args := map[string]any{"account_number": acct}
	if start != "" {
		args["created_at_gte"] = start
	}
	raw, err := b.toolCtx(ctx, "get_equity_orders", args)
	if err != nil {
		return nil, err
	}
	var root any
	if err := json.Unmarshal(robinhood.ToolContentJSON(raw), &root); err != nil {
		return nil, fmt.Errorf("%w: unreadable order history from Robinhood: %v", ErrOrderUnavailable, err)
	}
	var out []any
	collectOrders(root, &out)
	return filterOrdersBySessionDate(out, start, end), nil
}

func (b *RobinhoodBroker) ordersByState(ctx context.Context, all bool) ([]any, error) {
	acct, err := b.agenticAccountCtx(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := b.toolCtx(ctx, "get_equity_orders", map[string]any{"account_number": acct})
	if err != nil {
		return nil, err
	}
	var root any
	// "No open orders" skips the pre-entry cancel and clears the T-1
	// reconcile, so it must come from a body we could actually read.
	if err := json.Unmarshal(robinhood.ToolContentJSON(raw), &root); err != nil {
		return nil, fmt.Errorf("%w: unreadable orders response from Robinhood: %v", ErrOrderUnavailable, err)
	}
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
	ref := asUUID(clientOrderID)
	if _, err := uuid.Parse(ref); err != nil {
		return fmt.Errorf("cancel order_id is not a UUID: %q", clientOrderID)
	}
	// cancel_equity_order takes Robinhood's own order UUID; ref_id is the id we
	// generated when placing. Sending ours failed with "order not found", and
	// the T-1 pre-entry cancel treats that as ErrOpenOrderCancelFailed and
	// skips the entry (AUD-053). Resolve the broker id from the order first.
	detail, err := b.OrderDetail(ref)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(fmt.Sprint(first(detail, "id", "order_id")))
	if _, err := uuid.Parse(id); err != nil {
		return fmt.Errorf("cancel: no broker order_id for ref %s", ref)
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

// ResetAccount drops the in-memory Agentic Account cache so the next
// agenticAccount() re-resolves from the store or MCP. Dashboard ?refresh=1
// (P-11 / B-11) is the call site.
func (b *RobinhoodBroker) ResetAccount() {
	if b == nil {
		return
	}
	b.setAccount("")
}

func (b *RobinhoodBroker) agenticAccount() (string, error) {
	return b.agenticAccountCtx(context.Background())
}

func (b *RobinhoodBroker) agenticAccountCtx(ctx context.Context) (string, error) {
	if acct := b.cachedAccount(); acct != "" {
		return acct, nil
	}
	if b.Svc != nil && b.Svc.DB != nil {
		if acct := strings.TrimSpace(b.Svc.DB.GetRobinhoodOAuth().AccountNumber); acct != "" {
			b.setAccount(acct)
			return acct, nil
		}
	}
	raw, err := b.toolCtx(ctx, "get_accounts", nil)
	if err != nil {
		return "", err
	}
	var root any
	_ = json.Unmarshal(robinhood.ToolContentJSON(raw), &root)
	acct := findAgentic(root)
	if acct == "" {
		return "", fmt.Errorf("Agentic Account не подключён")
	}
	b.setAccount(acct)
	if b.Svc != nil && b.Svc.DB != nil {
		_ = b.Svc.DB.SaveRobinhoodAccount(acct)
	}
	return acct, nil
}

func integerQty(qty float64) string {
	n := int64(math.Floor(qty + 1e-9))
	if n < 1 {
		return ""
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
			// Keep the broker row as it came: the cabinet shows average price,
			// cost basis, last price and unrealized PnL from these fields.
			// Only quantity and market value are normalized to numbers.
			row := make(map[string]any, len(t)+1)
			for k, v := range t {
				row[k] = v
			}
			qty := asFloat(first(t, "quantity", "qty"))
			row["quantity"] = qty
			mv := asFloat(first(t, "market_value", "marketValue", "value"))
			if mv == 0 {
				mv = qty * asFloat(first(t, "last_price", "last_trade_price", "mark_price", "price"))
			}
			if mv != 0 {
				row["market_value"] = mv
			}
			*out = append(*out, row)
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

func orderSessionDate(m map[string]any) string {
	if m == nil {
		return ""
	}
	v := first(m, "created_at", "createdAt")
	if v == nil {
		return ""
	}
	d := tradingdate.DateKey(fmt.Sprint(v))
	if tradingdate.IsValid(d) {
		return d
	}
	return ""
}

func filterOrdersBySessionDate(orders []any, start, end string) []any {
	if start == "" && end == "" {
		return orders
	}
	var out []any
	for _, o := range orders {
		m, _ := o.(map[string]any)
		d := orderSessionDate(m)
		if d != "" {
			if start != "" && tradingdate.Compare(d, start) < 0 {
				continue
			}
			if end != "" && tradingdate.Compare(d, end) > 0 {
				continue
			}
		}
		out = append(out, o)
	}
	return out
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
