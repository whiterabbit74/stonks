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
	mu        sync.Mutex
	Orders    []OrderResult
	Token     string
	Cal       []byte
	Splits    []map[string]any
	Acct      map[string]any
	Pos       []any
	FailPlace string
}

func (m *MemoryBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.FailPlace != "" {
		return OrderResult{Error: m.FailPlace}, fmt.Errorf("%s", m.FailPlace)
	}
	id := fmt.Sprintf("oid-%s-%d", symbol, len(m.Orders)+1)
	res := OrderResult{Submitted: true, ClientOrderID: id, Quantity: qty, Symbol: symbol, Side: side}
	m.Orders = append(m.Orders, res)
	return res, nil
}

func (m *MemoryBroker) CloseMarket(symbol string) (OrderResult, error) {
	return m.PlaceMarket(symbol, "SELL", 1)
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

func (m *MemoryBroker) Calendar() ([]byte, error) {
	if len(m.Cal) > 0 {
		return m.Cal, nil
	}
	return []byte(`{"holidays":{},"shortDays":{},"tradingHours":{"normal":{"start":"09:30","end":"16:00"}}}`), nil
}

func (m *MemoryBroker) RawSplits(symbol string) ([]map[string]any, error) {
	return m.Splits, nil
}

type EnvWebull struct {
	HTTP *http.Client
}

func EnvBroker() Broker {
	if os.Getenv("WEBULL_ACCESS_TOKEN") == "" && os.Getenv("WEBULL_APP_KEY") == "" {
		return nil
	}
	return &EnvWebull{HTTP: &http.Client{Timeout: 20 * time.Second}}
}

func (w *EnvWebull) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	return OrderResult{Error: "live Webull order placement requires app key/secret wiring"}, fmt.Errorf("webull place not fully wired")
}

func (w *EnvWebull) CloseMarket(symbol string) (OrderResult, error) {
	return w.PlaceMarket(symbol, "SELL", 1)
}

func (w *EnvWebull) Account() (map[string]any, error) {
	return map[string]any{"configured": true, "token_present": os.Getenv("WEBULL_ACCESS_TOKEN") != ""}, nil
}

func (w *EnvWebull) Positions() ([]any, error) { return []any{}, nil }

func (w *EnvWebull) CreateToken() (map[string]any, error) {
	return nil, fmt.Errorf("webull token create requires app credentials")
}

func (w *EnvWebull) CheckToken(token string) (map[string]any, error) {
	if strings.TrimSpace(token) == "" && os.Getenv("WEBULL_ACCESS_TOKEN") == "" {
		return map[string]any{"status": "MISSING"}, nil
	}
	return map[string]any{"status": "PRESENT"}, nil
}

func (w *EnvWebull) Calendar() ([]byte, error) {
	return nil, fmt.Errorf("webull calendar sync requires credentials")
}

func (w *EnvWebull) RawSplits(symbol string) ([]map[string]any, error) {
	return []map[string]any{}, nil
}

type MemoryQuotes struct {
	Bars map[string][]types.OHLC
	Q    map[string]providers.QuotePayload
}

func (m *MemoryQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
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
