package live

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/webull"
)

type LiveBroker struct {
	DB     *store.DB
	Client *webull.Client
}

func EnvBroker() Broker {
	return EnvBrokerDB(nil)
}

func EnvBrokerDB(db *store.DB) Broker {
	if os.Getenv("WEBULL_APP_KEY") == "" || os.Getenv("WEBULL_APP_SECRET") == "" {
		return nil
	}
	c := webull.FromEnv()
	if db != nil {
		c.Token = db.WebullAccessToken
	}
	return &LiveBroker{DB: db, Client: c}
}

// token reports the token the next request will carry. It resolves through the
// client so the answer cannot disagree with what actually goes on the wire.
func (b *LiveBroker) token() string {
	if b.DB != nil {
		if t := b.DB.WebullAccessToken(); t != "" {
			return t
		}
	}
	if b.Client != nil && b.Client.AccessToken != "" {
		return b.Client.AccessToken
	}
	return os.Getenv("WEBULL_ACCESS_TOKEN")
}

func (b *LiveBroker) client() *webull.Client {
	c := b.Client
	if c == nil {
		c = webull.FromEnv()
		if b.DB != nil {
			c.Token = b.DB.WebullAccessToken
		}
		b.Client = c
	}
	return c
}

func (b *LiveBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	return b.PlaceMarketCfg(symbol, side, qty, PlaceMarketCfg{})
}

func (b *LiveBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	c := b.client()
	if qty <= 0 {
		qty = 1
	}
	inst, err := c.ResolveInstrumentID(symbol)
	if err != nil {
		return OrderResult{Error: err.Error()}, err
	}
	cid := strings.TrimSpace(cfg.ClientOrderID)
	if cid == "" {
		cid = webull.NewClientOrderID()
	}
	tif := strOr(cfg.TimeInForce, "DAY")
	session := strOr(cfg.SupportTradingSession, "CORE")
	// Live path always sends MARKET. The strategy trades at the official close
	// and the fill must be certain: a limit that misses leaves the position on
	// the wrong side of the day with no second chance before the bell.
	order := map[string]any{
		"combo_type":              "NORMAL",
		"client_order_id":         cid,
		"symbol":                  symbol,
		"instrument_id":           inst,
		"instrument_type":         "EQUITY",
		"market":                  "US",
		"side":                    strings.ToUpper(side),
		"order_type":              "MARKET",
		"quantity":                formatOrderQuantity(qty),
		"time_in_force":           tif,
		"support_trading_session": session,
		"entrust_type":            "QTY",
		"extended_hours_trading":  false,
	}
	placed, err := c.PlaceOrder(c.AccountID, order)
	if err != nil {
		return OrderResult{ClientOrderID: cid, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	// The place-order body is not just an HTTP-status check: if it echoes back
	// a client_order_id that is not the one we sent, we cannot be sure which
	// order (if any) this response describes. Report that as ambiguous rather
	// than silently trusting the request succeeded as sent — see P0-6 in
	// AUTOTRADE_ROADMAP.md. The caller (placeMarket) picks the id before the
	// request and decides how to resolve an ambiguous outcome; it must not be
	// resubmitted from here.
	if respCid := placedClientOrderID(placed.Data); respCid != "" && respCid != cid {
		if b.DB != nil {
			_ = b.DB.AppendAutotradeLog("brokerRaw event=order_place_id_mismatch sentClientOrderId=" + cid + " gotClientOrderId=" + respCid)
		}
		return OrderResult{
			ClientOrderID: cid, Symbol: symbol, Side: side, Quantity: qty,
			Ambiguous: true,
			Error:     "Webull place response returned client_order_id " + respCid + ", sent " + cid,
		}, nil
	}
	status := "submitted"
	var filledPrice, filledQty float64
	if detail, terr := c.OrderDetail(c.AccountID, cid); terr != nil {
		if b.DB != nil {
			_ = b.DB.AppendAutotradeLog("brokerRaw event=order_tracking_start_failed clientOrderId=" + cid + " error=" + terr.Error())
		}
	} else {
		parsed := extractOrderDetailPayload(detail.Data)
		if parsed == nil {
			parsed = extractOrderDetailPayload(map[string]any{"raw": string(detail.Raw)})
		}
		st := NormalizeOrderStatus(orderStatusField(parsed))
		if st != "" && st != "unknown" {
			status = st
		}
		filledPrice = fillPriceFrom(parsed)
		filledQty = fillQtyFrom(parsed)
		if b.DB != nil {
			_ = b.DB.AppendAutotradeLog("brokerRaw event=order_track clientOrderId=" + cid + " status=" + status)
		}
	}
	return OrderResult{Submitted: true, ClientOrderID: cid, Quantity: qty, Symbol: symbol, Side: side, Status: status, FilledPrice: filledPrice, FilledQty: filledQty}, nil
}

func (b *LiveBroker) CloseMarket(symbol string) (OrderResult, error) {
	pos, err := b.Positions()
	if err != nil {
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	qty := PositionQuantity(pos, symbol)
	if !(qty > 0) {
		err := fmt.Errorf("No broker position found for %s", symbol)
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	return b.PlaceMarket(symbol, "SELL", qty)
}

func (b *LiveBroker) Account() (map[string]any, error) {
	c := b.client()
	bal, err := c.AccountBalance(c.AccountID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"balance": bal.Data, "account_id": c.AccountID}, nil
}

func (b *LiveBroker) Positions() ([]any, error) {
	c := b.client()
	resp, err := c.AccountPositions(c.AccountID)
	if err != nil {
		return nil, err
	}
	if rows := flattenAny(resp.Data); rows != nil {
		return rows, nil
	}
	return []any{}, nil
}

func (b *LiveBroker) CreateToken() (map[string]any, error) {
	resp, err := b.client().CreateToken()
	if err != nil {
		return nil, err
	}
	m, _ := resp.Data.(map[string]any)
	if m == nil {
		m = map[string]any{"raw": string(resp.Raw)}
	}
	return m, nil
}

func (b *LiveBroker) CheckToken(token string) (map[string]any, error) {
	if token == "" {
		token = b.token()
	}
	resp, err := b.client().CheckToken(token)
	if err != nil {
		return nil, err
	}
	m, _ := resp.Data.(map[string]any)
	if m == nil {
		m = map[string]any{"raw": string(resp.Raw)}
	}
	return m, nil
}

func (b *LiveBroker) CalendarDays(start, end string) ([]map[string]any, error) {
	c := b.client()
	resp, err := c.TradeCalendar(start, end)
	if err != nil {
		return nil, err
	}
	rows := flattenAny(resp.Data)
	if a, ok := resp.Data.([]any); ok {
		rows = a
	}
	var out []map[string]any
	for _, r := range rows {
		if m, ok := r.(map[string]any); ok {
			out = append(out, m)
		}
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (b *LiveBroker) Calendar() ([]byte, error) {
	resp, err := b.client().TradeCalendar("", "")
	if err != nil {
		return nil, err
	}
	if len(resp.Raw) > 0 {
		return resp.Raw, nil
	}
	return json.Marshal(resp.Data)
}

func (b *LiveBroker) RawSplits(symbol string) ([]map[string]any, error) {
	c := b.client()
	id, err := c.ResolveInstrumentID(symbol)
	if err != nil {
		return nil, err
	}
	resp, err := c.CorpActions(id)
	if err != nil {
		return nil, err
	}
	var out []map[string]any
	for _, row := range flattenAny(resp.Data) {
		if m, ok := row.(map[string]any); ok {
			out = append(out, m)
		}
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (b *LiveBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	c := b.client()
	resp, err := c.OrderDetail(c.AccountID, clientOrderID)
	if err != nil {
		return nil, err
	}
	parsed := extractOrderDetailPayload(resp.Data)
	if parsed == nil {
		parsed = map[string]any{}
	}
	out := copyStringAnyMap(parsed)
	if st := orderStatusField(parsed); st != "" {
		out["status"] = st
	}
	if p := fillPriceFrom(parsed); p > 0 {
		out["filled_price"] = p
	}
	if q := fillQtyFrom(parsed); q > 0 {
		out["filled_qty"] = q
	}
	if len(resp.Raw) > 0 {
		out["raw"] = string(resp.Raw)
	}
	if NormalizeOrderStatus(orderStatusField(out)) == "unknown" {
		if snap := b.findOrderSnapshotByClientOrderID(clientOrderID); snap != nil {
			for k, v := range snap {
				if _, exists := out[k]; !exists || out[k] == nil || fmt.Sprint(out[k]) == "" {
					out[k] = v
				}
			}
			if st := orderStatusField(snap); st != "" {
				out["status"] = st
			}
			if p := fillPriceFrom(snap); p > 0 {
				out["filled_price"] = p
			}
			if q := fillQtyFrom(snap); q > 0 {
				out["filled_qty"] = q
			}
		}
	}
	if NormalizeOrderStatus(orderStatusField(out)) == "unknown" && clientOrderIDOf(out) == "" {
		return nil, fmt.Errorf("%w: %s", ErrOrderNotFound, clientOrderID)
	}
	return out, nil
}

func (b *LiveBroker) findOrderSnapshotByClientOrderID(clientOrderID string) map[string]any {
	match := func(rows []any) map[string]any {
		for _, row := range rows {
			m := extractOrderDetailPayload(row)
			if m == nil {
				m = mapOf(row)
			}
			if clientOrderIDOf(m) == clientOrderID {
				return m
			}
		}
		return nil
	}
	if open, err := b.OpenOrders(); err == nil {
		if m := match(open); m != nil {
			return m
		}
	}
	if hist, err := b.OrderHistory("", ""); err == nil {
		return match(hist)
	}
	return nil
}

func (b *LiveBroker) OpenOrders() ([]any, error) {
	c := b.client()
	resp, err := c.ListOpenOrders(c.AccountID, 50)
	if err != nil {
		return nil, err
	}
	rows := flattenAny(resp.Data)
	if rows == nil {
		rows = []any{}
	}
	return rows, nil
}

func (b *LiveBroker) CancelOrder(clientOrderID string) error {
	c := b.client()
	_, err := c.CancelOrder(c.AccountID, clientOrderID)
	return err
}

func (b *LiveBroker) OrderHistory(start, end string) ([]any, error) {
	c := b.client()
	resp, err := c.OrderHistory(c.AccountID, start, end, 100)
	if err != nil {
		return nil, err
	}
	rows := flattenAny(resp.Data)
	if rows == nil {
		rows = []any{}
	}
	return rows, nil
}

// placedClientOrderID extracts the client_order_id Webull's place-order
// response echoes back, if any. Absent (the common case: Webull's place body
// is typically just {"code":"0"}) is reported as "", not a mismatch.
func placedClientOrderID(data any) string {
	parsed := extractOrderDetailPayload(data)
	if parsed == nil {
		return ""
	}
	return clientOrderIDOf(parsed)
}

func flattenAny(v any) []any {
	return flattenAnyDepth(v, 0)
}

func flattenAnyDepth(v any, depth int) []any {
	if depth > 4 {
		return nil
	}
	if a, ok := v.([]any); ok {
		return a
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	for _, k := range []string{"data", "holdings", "positions", "result", "items", "orders", "list"} {
		child, ok := m[k]
		if !ok {
			continue
		}
		if a, ok := child.([]any); ok {
			return a
		}
		if nested := flattenAnyDepth(child, depth+1); nested != nil {
			return nested
		}
	}
	return nil
}
