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
		if tok := db.GetWebullToken().Token; tok != "" {
			c.AccessToken = tok
		}
	}
	return &LiveBroker{DB: db, Client: c}
}

func (b *LiveBroker) token() string {
	if b.DB != nil {
		if t := b.DB.GetWebullToken().Token; t != "" {
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
		b.Client = c
	}
	if tok := b.token(); tok != "" {
		c.AccessToken = tok
	}
	return c
}

func (b *LiveBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	c := b.client()
	if qty <= 0 {
		qty = 1
	}
	inst, err := c.ResolveInstrumentID(symbol)
	if err != nil {
		return OrderResult{Error: err.Error()}, err
	}
	cid := webull.NewClientOrderID()
	order := map[string]any{
		"combo_type":              "NORMAL",
		"client_order_id":         cid,
		"symbol":                  symbol,
		"instrument_id":           inst,
		"instrument_type":         "EQUITY",
		"market":                  "US",
		"side":                    strings.ToUpper(side),
		"order_type":              "MARKET",
		"quantity":                fmt.Sprintf("%.0f", qty),
		"time_in_force":           "DAY",
		"support_trading_session": "CORE",
		"entrust_type":            "QTY",
		"extended_hours_trading":  false,
	}
	placed, err := c.PlaceOrder(c.AccountID, order)
	if err != nil {
		return OrderResult{ClientOrderID: cid, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
	}
	status := "submitted"
	if detail, terr := c.OrderDetail(c.AccountID, cid); terr != nil {
		if b.DB != nil {
			_ = b.DB.AppendAutotradeLog("order_tracking_start_failed " + cid + " " + terr.Error())
		}
	} else {
		if b.DB != nil {
			_ = b.DB.AppendAutotradeLog("order_track " + cid)
		}
		raw := strings.ToUpper(string(detail.Raw))
		if strings.Contains(raw, "FILLED") || strings.Contains(raw, "EXECUTED") {
			status = "filled"
		}
	}
	_ = placed
	return OrderResult{Submitted: true, ClientOrderID: cid, Quantity: qty, Symbol: symbol, Side: side, Status: status}, nil
}

func (b *LiveBroker) CloseMarket(symbol string) (OrderResult, error) {
	pos, err := b.Positions()
	if err != nil {
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	qty := PositionQuantity(pos, symbol, false)
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
	m, _ := resp.Data.(map[string]any)
	if m == nil {
		m = map[string]any{}
	}
	if len(resp.Raw) > 0 {
		m["raw"] = string(resp.Raw)
	}
	return m, nil
}

func flattenAny(v any) []any {
	if a, ok := v.([]any); ok {
		return a
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	for _, k := range []string{"data", "holdings", "positions", "result", "items"} {
		if a, ok := m[k].([]any); ok {
			return a
		}
	}
	return nil
}
