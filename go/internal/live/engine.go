package live

import (
	"errors"
	"os"
	"sync"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
)

// ErrOrderNotFound means the broker answered and does not know this client id.
// A lookup error that is not this sentinel must not be retried as a new order.
var ErrOrderNotFound = errors.New("order not found")

// ErrOrderUnavailable means the broker could not confirm the id (listing lag,
// truncated page, transport). It is not proof the order is absent: do not
// resubmit with a new id and do not delete the journal row.
var ErrOrderUnavailable = errors.New("order listing unavailable")

// ListingLagWait is how long a listing-based OrderDetail may miss an id
// before the tracker is marked execution_unknown. Tests may shorten it.
var ListingLagWait = 60 * time.Second

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
	FilledPrice   float64 `json:"filledPrice,omitempty"`
	FilledQty     float64 `json:"filledQty,omitempty"`
	// Ambiguous means the submission failed AND the follow-up lookup could not
	// say whether the order reached the broker. Never report this as submitted:
	// the order may or may not exist, so it is tracked but not counted as done.
	Ambiguous bool `json:"ambiguous,omitempty"`
}

// PlaceMarketCfg is passed to PlaceMarketCfg without changing PlaceMarket(symbol,side,qty).
type PlaceMarketCfg struct {
	TimeInForce           string
	SupportTradingSession string
	// ClientOrderID lets the caller pick the id before the request goes out,
	// so a submission that fails ambiguously can be probed by that id instead
	// of blindly resent. Empty means the broker generates one.
	ClientOrderID string
}

type marketCfgPlacer interface {
	PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error)
}

type Broker interface {
	PlaceMarket(symbol, side string, qty float64) (OrderResult, error)
	CloseMarket(symbol string) (OrderResult, error)
	Account() (map[string]any, error)
	Positions() ([]any, error)
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
	Brokers  map[string]Broker
	ChatID   string
	Now      func() time.Time
	Sleep    func(time.Duration)

	mu           sync.Mutex
	reservations map[string]string
	wheels       map[string]bool
	inFlight     map[string]bool
	orderMeta    map[string]orderMeta
	quoteCache   map[string]quoteCacheEntry
	activeBroker string
	lastRunAt    string
	lastResult   any
}

type quoteCacheEntry struct {
	payload  providers.QuotePayload
	provider string
	err      error
	at       time.Time
}

type orderMeta struct {
	CorrelationID string
	IBS           float64
	DateKey       string
	QuotePrice    float64
	Action        string
	Symbol        string
	Quantity      float64
	Source        string
	Broker        string
}

func New(db *store.DB, quotes QuoteSource) *Engine {
	return &Engine{
		DB:           db,
		Quotes:       quotes,
		Telegram:     EnvTelegram(),
		Broker:       EnvBrokerDB(db),
		ChatID:       os.Getenv("TELEGRAM_CHAT_ID"),
		reservations: map[string]string{},
		quoteCache:   map[string]quoteCacheEntry{},
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
