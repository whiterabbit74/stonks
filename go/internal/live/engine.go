package live

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/robinhood"
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

// BrokerOrder is what the engine reads from a broker about one order. Each
// adapter fills it from its own answer at the edge, so no broker's JSON shape
// reaches engine logic. Raw keeps that answer for the dashboards: an order
// marshals as the broker sent it.
type BrokerOrder struct {
	ClientOrderID string
	BrokerOrderID string
	Symbol        string
	// Status is in NormalizeOrderStatus vocabulary; "unknown" when not reported.
	Status string
	// FilledQty is the cumulative executed quantity, 0 = none reported.
	FilledQty float64
	// FilledPrice is the average fill price, 0 = not reported.
	FilledPrice float64
	Raw         any
}

func (o BrokerOrder) MarshalJSON() ([]byte, error) { return json.Marshal(o.Raw) }

// filledQty and filledPrice read an answer that may be missing as "nothing
// reported".
func (o *BrokerOrder) filledQty() float64 {
	if o == nil {
		return 0
	}
	return o.FilledQty
}

func (o *BrokerOrder) filledPrice() float64 {
	if o == nil {
		return 0
	}
	return o.FilledPrice
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

// Broker is the trading account the engine acts on. Every method takes a
// context: the T-1 path has a hard close-of-session deadline, and a broker call
// that cannot be cancelled eats the whole remaining minute. This used to be an
// optional OrderDetailCtx/OpenOrdersCtx/PositionsCtx/AccountCtx extension that
// the engine reached through a type assertion, which made the deadline depend
// on the concrete broker behind the interface — something the interface itself
// did not say.
//
// PlaceMarket takes the placement config directly for the same reason: the
// separate PlaceMarketCfg extension meant an order's stop-loss and TIF applied
// or not depending on the dynamic type.
type Broker interface {
	PlaceMarket(ctx context.Context, symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error)
	CloseMarket(ctx context.Context, symbol string) (OrderResult, error)
	Account(ctx context.Context) (map[string]any, error)
	Positions(ctx context.Context) ([]any, error)
	OrderDetail(ctx context.Context, clientOrderID string) (*BrokerOrder, error)
	OpenOrders(ctx context.Context) ([]BrokerOrder, error)
	OrderHistory(ctx context.Context, start, end string) ([]BrokerOrder, error)
	CancelOrder(ctx context.Context, clientOrderID string) error
}

// accountLister stays optional: it is a real capability difference, not a
// half-migration. Webull can report the accounts it actually holds; the
// Robinhood MCP broker has no such call.
type accountLister interface {
	AccountList() ([]any, error)
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

	mu                 sync.Mutex
	reservations       map[string]string
	wheels             map[string]bool
	wheelWG            sync.WaitGroup
	stopWheels         bool
	inFlight           map[string]bool
	closeNotices       map[string]string
	holdNotices        bool
	heldNotices        [][2]string
	quoteCache         map[string]quoteCacheEntry
	trackerPersistFail map[string]bool
	lastRunAt          string
	lastResult         any
}

type quoteCacheEntry struct {
	payload  providers.QuotePayload
	provider string
	err      error
	at       time.Time
}

// orderMeta is what an order is sent with. It is written into its tracker, so
// the fill reads it back from there even after a restart.
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

// decisionIBS is the IBS the order was decided on, nil for an order that is
// not a strategy decision. A strategy order always carries a correlation id,
// so its IBS is a real reading even at exactly 0.
func (m orderMeta) decisionIBS() *float64 {
	if m.IBS > 0 || m.CorrelationID != "" {
		v := m.IBS
		return &v
	}
	return nil
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

// NewProcess wires the process's one Engine: the quote source's Webull token
// and Robinhood client, then Webull and (when connected) Robinhood brokers.
// Call it once per process. A second Engine on the same DB keeps its own
// in-memory reservations and in-flight orders, so it would not see the
// first one's T-1 guard.
func NewProcess(db *store.DB, p *providers.Client) *Engine {
	if p != nil {
		p.UseWebullToken(db.WebullAccessToken)
		// One Service for the life of the process: it reads tokens from the
		// DB on every call, so OAuth complete never has to replace it (AUD-193).
		p.Robinhood = robinhood.New(db)
	}
	e := New(db, p)
	if e.Broker != nil {
		e.AttachBroker("webull", e.Broker)
	}
	// A failed read is not "Robinhood is not connected". Leaving the broker
	// unattached hides its positions and open orders from every later T-1
	// reconcile for the life of the process, and the entry would be placed as
	// if nothing were held there. Attach it and let its own calls fail loudly.
	rhRow, rhErr := db.GetRobinhoodOAuthErr()
	if rhErr != nil || rhRow.AccessToken != "" {
		e.AttachBroker("robinhood", NewRobinhoodBroker(robinhood.New(db)))
	}
	return e
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
