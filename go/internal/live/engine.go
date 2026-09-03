package live

import (
	"os"
	"sync"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
)

// providers import used by quotes() nil-client guard.

type TelegramSender interface {
	Send(chatID, text string) error
}

type QuoteSource interface {
	Quote(symbol, provider string) (providers.QuotePayload, error)
	Historical(symbol, provider string, startTs, endTs int64, adjustment string) (providers.Historical, error)
}

type OrderResult struct {
	Submitted     bool    `json:"submitted"`
	Simulated     bool    `json:"simulated"`
	ClientOrderID string  `json:"clientOrderId"`
	Error         string  `json:"error,omitempty"`
	Quantity      float64 `json:"quantity,omitempty"`
	Symbol        string  `json:"symbol,omitempty"`
	Side          string  `json:"side,omitempty"`
	Status        string  `json:"status,omitempty"`
}

type Broker interface {
	PlaceMarket(symbol, side string, qty float64) (OrderResult, error)
	CloseMarket(symbol string) (OrderResult, error)
	Account() (map[string]any, error)
	Positions() ([]any, error)
	CreateToken() (map[string]any, error)
	CheckToken(token string) (map[string]any, error)
	Calendar() (jsonRaw []byte, err error)
	CalendarDays(start, end string) ([]map[string]any, error)
	RawSplits(symbol string) ([]map[string]any, error)
	OrderDetail(clientOrderID string) (map[string]any, error)
	OpenOrders() ([]any, error)
	OrderHistory(start, end string) ([]any, error)
	CancelOrder(clientOrderID string) error
}

type Engine struct {
	DB       *store.DB
	Quotes   QuoteSource
	Telegram TelegramSender
	Broker   Broker
	ChatID   string
	Now      func() time.Time
	Sleep    func(time.Duration)

	mu           sync.Mutex
	reservations map[string]string
	wheels       map[string]bool
	lastRunAt    string
	lastResult   any
}

func New(db *store.DB, quotes QuoteSource) *Engine {
	return &Engine{
		DB:           db,
		Quotes:       quotes,
		Telegram:     EnvTelegram(),
		Broker:       EnvBrokerDB(db),
		ChatID:       os.Getenv("TELEGRAM_CHAT_ID"),
		reservations: map[string]string{},
	}
}

func (e *Engine) now() time.Time {
	if e != nil && e.Now != nil {
		return e.Now()
	}
	return time.Now()
}

func (e *Engine) chat() string {
	if e.ChatID != "" {
		return e.ChatID
	}
	return os.Getenv("TELEGRAM_CHAT_ID")
}

func (e *Engine) quotes() QuoteSource {
	if e == nil || e.Quotes == nil {
		return nil
	}
	if c, ok := e.Quotes.(*providers.Client); ok && c == nil {
		return nil
	}
	return e.Quotes
}
