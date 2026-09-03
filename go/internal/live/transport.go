package live

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
)

type MemoryTelegram struct {
	mu       sync.Mutex
	Messages [][2]string
}

func (m *MemoryTelegram) Send(chatID, text string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Messages = append(m.Messages, [2]string{chatID, text})
	return nil
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
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

type MemoryBroker struct {
	mu         sync.Mutex
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
	FillQty    float64
	FillPrice  float64
	LastCfg    PlaceMarketCfg
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
	m.mu.Unlock()
	return m.PlaceMarket(symbol, side, qty)
}

func (m *MemoryBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.FailPlace != "" {
		return OrderResult{Error: m.FailPlace}, fmt.Errorf("%s", m.FailPlace)
	}
	id := fmt.Sprintf("oid-%s-%d", symbol, len(m.Orders)+1)
	status := m.FillStatus
	if status == "" {
		status = "submitted"
	}
	res := OrderResult{Submitted: true, ClientOrderID: id, Quantity: qty, Symbol: symbol, Side: side, Status: status}
	m.Orders = append(m.Orders, res)
	return res, nil
}

func (m *MemoryBroker) CloseMarket(symbol string) (OrderResult, error) {
	m.mu.Lock()
	pos := m.Pos
	m.mu.Unlock()
	qty := PositionQuantity(pos, symbol, false)
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
	return map[string]any{"account_id": "test"}, nil
}

func (m *MemoryBroker) Positions() ([]any, error) {
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
	if m.Open != nil {
		return m.Open, nil
	}
	return []any{}, nil
}

func (m *MemoryBroker) OrderHistory(start, end string) ([]any, error) {
	if m.Hist != nil {
		return m.Hist, nil
	}
	return []any{}, nil
}

func (m *MemoryBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.DetailN++
	if m.Details != nil {
		if d, ok := m.Details[clientOrderID]; ok {
			return d, nil
		}
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
