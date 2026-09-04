package live

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

type MemoryTelegram struct {
	mu       sync.Mutex
	Messages [][2]string
	Fail     error
	FailN    int
}

func (m *MemoryTelegram) Send(chatID, text string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil && m.FailN >= 0 {
		if m.FailN > 0 {
			m.FailN--
			if m.FailN == 0 {
				m.FailN = -1
			}
		}
		return m.Fail
	}
	m.Messages = append(m.Messages, [2]string{chatID, text})
	return nil
}

// Sent returns a snapshot of the messages. The tracker wheel sends from its
// own goroutine, so reading Messages directly races with it.
func (m *MemoryTelegram) Sent() [][2]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([][2]string(nil), m.Messages...)
}

// Reset drops the recorded messages under the lock.
func (m *MemoryTelegram) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Messages = nil
}

type HTTPTelegram struct {
	Token  string
	Client *http.Client
}

func EnvTelegram() TelegramSender {
	tok := os.Getenv("TELEGRAM_BOT_TOKEN")
	if tok == "" {
		return nil
	}
	return &HTTPTelegram{Token: tok, Client: &http.Client{Timeout: 15 * time.Second}}
}

func (h *HTTPTelegram) Send(chatID, text string) error {
	u := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", h.Token)
	body, _ := json.Marshal(map[string]any{"chat_id": chatID, "text": text, "parse_mode": "HTML"})
	resp, err := h.Client.Post(u, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	var parsed struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	_ = json.Unmarshal(b, &parsed)
	if resp.StatusCode >= 300 || !parsed.OK {
		msg := parsed.Description
		if msg == "" {
			msg = strings.TrimSpace(string(b))
		}
		if msg == "" {
			msg = fmt.Sprintf("status %d", resp.StatusCode)
		}
		return fmt.Errorf("telegram HTTP %d: %s", resp.StatusCode, msg)
	}
	return nil
}

type MemoryBroker struct {
	mu         sync.Mutex
	Name       string
	Orders     []OrderResult
	Token      string
	Cal        []byte
	Splits     []map[string]any
	Acct       map[string]any
	Pos        []any
	FailPlace  string
	FillStatus string
	Details    map[string]map[string]any
	Open       []any
	Hist       []any
	Days       []map[string]any
	Cancelled  []string
	DetailN    int
	NextID     string
	// FailPlaceN is how many placements FailPlace applies to; 0 means "all"
	// via the -1 sentinel set in SetFailPlace.
	FailPlaceN       int
	FailPlaceRecords bool
	FillQty          float64
	FillPrice        float64
	LastCfg          PlaceMarketCfg
	FailPositions    error
	FailDetail       error
	FailOpenOrders   error
	// ListingLag makes OrderDetail return ErrOrderUnavailable unless SetDetail
	// has an explicit row for that id. Models Robinhood list-based lookup.
	ListingLag   bool
	BeforeDetail func()
}

// SetFailPlace makes the next n placements fail; n <= 0 fails every placement.
// records = true means the order still reached the broker and only the reply
// was lost, the ambiguous case an idempotent retry has to detect.
func (m *MemoryBroker) SetFailPlace(msg string, n int, records bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.FailPlace = msg
	m.FailPlaceN = n
	m.FailPlaceRecords = records
}

func (m *MemoryBroker) SetDetail(id string, d map[string]any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Details == nil {
		m.Details = map[string]map[string]any{}
	}
	m.Details[id] = d
}

func (m *MemoryBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	m.mu.Lock()
	m.LastCfg = cfg
	m.NextID = cfg.ClientOrderID
	m.mu.Unlock()
	return m.PlaceMarket(symbol, side, qty)
}

func (m *MemoryBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// FailPlaceN == 0 means "fail every placement" so that setting FailPlace
	// alone keeps working; a positive count fails exactly that many.
	if m.FailPlace != "" && m.FailPlaceN >= 0 {
		if m.FailPlaceN > 0 {
			m.FailPlaceN--
			if m.FailPlaceN == 0 {
				m.FailPlaceN = -1
			}
		}
		if m.FailPlaceRecords {
			// The order reached the broker; only the response was lost.
			id := m.NextID
			m.NextID = ""
			if id == "" {
				id = fmt.Sprintf("oid-%s-%d", symbol, len(m.Orders)+1)
			}
			m.Orders = append(m.Orders, OrderResult{
				Submitted: true, ClientOrderID: id, Quantity: qty, Symbol: symbol, Side: side,
			})
		}
		return OrderResult{Error: m.FailPlace}, fmt.Errorf("%s", m.FailPlace)
	}
	id := m.NextID
	m.NextID = ""
	if id == "" {
		id = fmt.Sprintf("oid-%s-%d", symbol, len(m.Orders)+1)
	}
	status := m.FillStatus
	if status == "" {
		status = "submitted"
	}
	res := OrderResult{Submitted: true, ClientOrderID: id, Quantity: qty, Symbol: symbol, Side: side, Status: status}
	m.Orders = append(m.Orders, res)
	if strings.EqualFold(side, "SELL") || strings.EqualFold(status, "FILLED") || strings.EqualFold(status, "filled") {
		m.applyPosition(symbol, side, qty)
	}
	return res, nil
}

func (m *MemoryBroker) applyPosition(symbol, side string, qty float64) {
	want := store.SafeTicker(symbol)
	sell := strings.EqualFold(side, "SELL")
	var next []any
	found := false
	for _, row := range m.Pos {
		mp := mapOf(row)
		if mp == nil {
			continue
		}
		if store.SafeTicker(firstString(mp, "symbol", "ticker", "display_symbol")) != want {
			next = append(next, row)
			continue
		}
		found = true
		cur := firstPositive(mp["quantity"], mp["qty"])
		if sell {
			cur -= qty
		} else {
			cur += qty
		}
		if cur > 1e-9 {
			mp["quantity"] = cur
			next = append(next, mp)
		}
	}
	if !sell && !found && qty > 0 {
		next = append(next, map[string]any{"symbol": want, "quantity": qty})
	}
	m.Pos = next
}

func (m *MemoryBroker) CloseMarket(symbol string) (OrderResult, error) {
	m.mu.Lock()
	pos := m.Pos
	m.mu.Unlock()
	qty := PositionQuantity(pos, symbol)
	if !(qty > 0) {
		err := fmt.Errorf("No broker position found for %s", symbol)
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	return m.PlaceMarket(symbol, "SELL", qty)
}

func (m *MemoryBroker) Account() (map[string]any, error) {
	if m.Acct != nil {
		return m.Acct, nil
	}
	// Entries are always sized from the account, so a broker with no balance
	// could never place one. $1000 keeps the arithmetic in the tests simple.
	return map[string]any{
		"account_id": "test",
		"data": map[string]any{"account_currency_assets": []any{map[string]any{
			"currency": "USD", "day_buying_power": 1000.0, "cash_balance": 1000.0,
			"net_liquidation_value": 1000.0,
		}}},
	}, nil
}

func (m *MemoryBroker) Positions() ([]any, error) {
	if m.FailPositions != nil {
		return nil, m.FailPositions
	}
	if m.Pos != nil {
		return m.Pos, nil
	}
	return []any{}, nil
}

func (m *MemoryBroker) CreateToken() (map[string]any, error) {
	m.Token = "tok-test"
	return map[string]any{"token": m.Token, "status": "PENDING"}, nil
}

func (m *MemoryBroker) CheckToken(token string) (map[string]any, error) {
	return map[string]any{"status": "NORMAL", "token": token}, nil
}

func (m *MemoryBroker) CalendarDays(start, end string) ([]map[string]any, error) {
	var out []map[string]any
	for _, d := range m.Days {
		day := fmt.Sprint(d["trade_day"])
		if day >= start && day <= end {
			out = append(out, d)
		}
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (m *MemoryBroker) Calendar() ([]byte, error) {
	if len(m.Cal) > 0 {
		return m.Cal, nil
	}
	return []byte(`{"holidays":{},"shortDays":{},"tradingHours":{"normal":{"start":"09:30","end":"16:00"}}}`), nil
}

func (m *MemoryBroker) RawSplits(symbol string) ([]map[string]any, error) {
	return m.Splits, nil
}

func (m *MemoryBroker) OpenOrders() ([]any, error) {
	if m.FailOpenOrders != nil {
		return nil, m.FailOpenOrders
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Open != nil {
		return m.Open, nil
	}
	var out []any
	for _, o := range m.Orders {
		st := NormalizeOrderStatus(o.Status)
		if IsFinalOrderStatus(st) {
			continue
		}
		out = append(out, map[string]any{
			"symbol": o.Symbol, "client_order_id": o.ClientOrderID, "status": o.Status,
		})
	}
	if out == nil {
		out = []any{}
	}
	return out, nil
}

func (m *MemoryBroker) OrderHistory(start, end string) ([]any, error) {
	if m.Hist != nil {
		return m.Hist, nil
	}
	return []any{}, nil
}

func (m *MemoryBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	if m.BeforeDetail != nil {
		m.BeforeDetail()
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.DetailN++
	if m.FailDetail != nil {
		return nil, m.FailDetail
	}
	if m.Details != nil {
		if d, ok := m.Details[clientOrderID]; ok {
			return d, nil
		}
	}
	if m.ListingLag {
		return nil, fmt.Errorf("%w: %s", ErrOrderUnavailable, clientOrderID)
	}
	// Only ids this broker actually accepted are known, so a caller can use a
	// lookup to tell "the submission landed" from "it never arrived".
	known := false
	for _, o := range m.Orders {
		if o.ClientOrderID == clientOrderID {
			known = true
			break
		}
	}
	if !known {
		return nil, fmt.Errorf("%w: %s", ErrOrderNotFound, clientOrderID)
	}
	if m.FillStatus != "" {
		// A broker configured to fill also reports the fill when polled.
		return map[string]any{
			"status": m.FillStatus, "client_order_id": clientOrderID,
			"filled_qty": m.FillQty, "filled_price": m.FillPrice,
		}, nil
	}
	return map[string]any{"status": "SUBMITTED", "client_order_id": clientOrderID}, nil
}

func (m *MemoryBroker) CancelOrder(clientOrderID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Cancelled = append(m.Cancelled, clientOrderID)
	return nil
}

type MemoryQuotes struct {
	Bars     map[string][]types.OHLC
	Q        map[string]providers.QuotePayload
	QuoteErr map[string]error
}

func (m *MemoryQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
	if m.QuoteErr != nil {
		if err, ok := m.QuoteErr[symbol]; ok && err != nil {
			return providers.QuotePayload{}, err
		}
	}
	if m.Q != nil {
		if q, ok := m.Q[symbol]; ok {
			return q, nil
		}
	}
	if m.Bars != nil {
		if rows, ok := m.Bars[symbol]; ok {
			return providers.BuildQuoteFromRows(rows)
		}
	}
	return providers.QuotePayload{}, fmt.Errorf("no quote for %s", symbol)
}

func (m *MemoryQuotes) Historical(symbol, provider string, startTs, endTs int64, adjustment string) (providers.Historical, error) {
	if m.Bars != nil {
		if rows, ok := m.Bars[symbol]; ok {
			return providers.Historical{Rows: rows}, nil
		}
	}
	return providers.Historical{}, fmt.Errorf("no history for %s", symbol)
}

// ProviderAwareQuotes answers per provider so a test can fail one and count
// how many times each was tried.
type ProviderAwareQuotes struct {
	mu    sync.Mutex
	Fail  map[string]error
	Bars  []types.OHLC
	Calls map[string]int
}

func (p *ProviderAwareQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
	p.mu.Lock()
	if p.Calls == nil {
		p.Calls = map[string]int{}
	}
	p.Calls[provider]++
	err := p.Fail[provider]
	p.mu.Unlock()
	if err != nil {
		return providers.QuotePayload{}, err
	}
	return providers.BuildQuoteFromRows(p.Bars)
}

func (p *ProviderAwareQuotes) Historical(symbol, provider string, startTs, endTs int64, adjustment string) (providers.Historical, error) {
	return providers.Historical{Rows: p.Bars}, nil
}
