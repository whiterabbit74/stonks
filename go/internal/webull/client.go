package webull

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// TradeHTTPTimeout bounds a single trading-path HTTP call (order placement,
// order-detail lookup). It is deliberately smaller than the 15s background
// timeout: the T-1 order must land before the close, and one hung call must
// not be able to eat the whole remaining budget. See P1-1 in
// AUTOTRADE_ROADMAP.md.
const TradeHTTPTimeout = 5 * time.Second

type Client struct {
	// HTTP is used for background calls (quotes, calendar, token checks) that
	// are not racing the session close.
	HTTP *http.Client
	// TradeHTTP is used for the trading-path calls that run inside the T-1
	// window (order placement, order-detail polling): a shorter, explicit
	// timeout so a single stuck request cannot consume the whole minute.
	TradeHTTP   *http.Client
	Base        string
	Host        string
	AppKey      string
	AppSecret   string
	AccessToken string
	AccountID   string
	// initMu guards the lazy defaults below (Base/Host/HTTP/TradeHTTP). One
	// Client is shared by concurrent callers — the quote prefetch fans out
	// across symbols — and filling these in on first use was a data race.
	initMu sync.Mutex
	// Token, when set, is consulted on every request instead of AccessToken.
	// The live token lives in SQLite and is replaced whenever the user renews
	// it, so a client shared between the HTTP handlers and the scheduler must
	// read it per request: copying it into AccessToken would both go stale and
	// race with the goroutine doing the copying.
	Token func() string
}

func (c *Client) accessToken() string {
	if c.Token != nil {
		if t := c.Token(); t != "" {
			return t
		}
	}
	return c.AccessToken
}

func FromEnv() *Client {
	host := envOr("WEBULL_API_HOST", "api.webull.com")
	return &Client{
		HTTP:        &http.Client{Timeout: 15 * time.Second},
		TradeHTTP:   &http.Client{Timeout: TradeHTTPTimeout},
		Base:        "https://" + host,
		Host:        host,
		AppKey:      os.Getenv("WEBULL_APP_KEY"),
		AppSecret:   os.Getenv("WEBULL_APP_SECRET"),
		AccessToken: os.Getenv("WEBULL_ACCESS_TOKEN"),
		AccountID:   os.Getenv("WEBULL_ACCOUNT_ID"),
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (c *Client) configured() error {
	if c == nil || c.AppKey == "" || c.AppSecret == "" {
		return fmt.Errorf("Ключи Webull не настроены")
	}
	return nil
}

type Response struct {
	Status int
	Data   any
	Raw    []byte
}

// webullBusinessSuccessCodes lists the values Webull's OpenAPI puts in a
// response body's "code"/"error_code" field to mean "no error" on an HTTP
// 200. A 200 with any other non-empty code is a business rejection (an
// order can be refused with a 200 and a body like {"code":"...","msg":"..."})
// and must not be read as success. Kept as a constant so the accepted set is
// explicit and auditable rather than an inline guess.
var webullBusinessSuccessCodes = map[string]bool{
	"0":       true,
	"200":     true,
	"success": true,
	"SUCCESS": true,
	"ok":      true,
	"OK":      true,
}

// businessCode extracts a non-empty code/error_code/errorCode field from a
// parsed JSON body, if present. Webull encodes it as either a string or a
// bare number depending on endpoint.
func businessCode(v any) (string, bool) {
	m, ok := v.(map[string]any)
	if !ok {
		return "", false
	}
	for _, k := range []string{"code", "error_code", "errorCode"} {
		raw, exists := m[k]
		if !exists || raw == nil {
			continue
		}
		switch t := raw.(type) {
		case string:
			if s := strings.TrimSpace(t); s != "" {
				return s, true
			}
		case float64:
			return strconv.FormatFloat(t, 'f', -1, 64), true
		}
	}
	return "", false
}

// Request issues a background-path call with no caller-supplied deadline
// (context.Background()) on the 15s HTTP client. Callers on the T-1 trading
// path use RequestCtx / requestTrade instead, so a slow call can be cancelled
// by the session-close deadline rather than eating the whole minute.
func (c *Client) Request(method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	return c.RequestCtx(context.Background(), method, path, query, body, includeToken, extraHeaders)
}

// RequestCtx is Request with an explicit context, on the background 15s
// client. Use it for reads that are still worth bounding by a caller's
// deadline but are not the order-placement/order-detail trading path.
func (c *Client) RequestCtx(ctx context.Context, method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	return c.doRequest(ctx, c.httpClient(), method, path, query, body, includeToken, extraHeaders)
}

// requestTrade is RequestCtx on the shorter trading-path HTTP client (see
// TradeHTTPTimeout).
func (c *Client) requestTrade(ctx context.Context, method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	return c.doRequest(ctx, c.tradeHTTPClient(), method, path, query, body, includeToken, extraHeaders)
}

func (c *Client) httpClient() *http.Client {
	c.initMu.Lock()
	defer c.initMu.Unlock()
	if c.HTTP == nil {
		c.HTTP = &http.Client{Timeout: 15 * time.Second}
	}
	return c.HTTP
}

func (c *Client) tradeHTTPClient() *http.Client {
	c.initMu.Lock()
	defer c.initMu.Unlock()
	if c.TradeHTTP == nil {
		c.TradeHTTP = &http.Client{Timeout: TradeHTTPTimeout}
	}
	return c.TradeHTTP
}

// endpoint fills in the API defaults once, under the lock, and returns the
// base URL and Host header this request must use.
func (c *Client) endpoint() (base, host string) {
	c.initMu.Lock()
	defer c.initMu.Unlock()
	if c.Base == "" {
		c.Base = "https://api.webull.com"
	}
	if c.Host == "" {
		c.Host = "api.webull.com"
	}
	return c.Base, c.Host
}

// MinRequestInterval is the smallest gap Webull tolerates between two calls on
// one app key: closer than this and the API answers "too many requests"
// whatever the endpoint. The gate is proactive because the reactive 429 retry
// below costs a full second each time it fires, and the T-1 cycle has one
// minute for everything.
//
// It is process-global rather than per Client on purpose: the quote provider
// and the broker adapter hold two separate Client values but share one Webull
// app key, so only a shared gate can actually pace the account. Robinhood has
// its own client and is untouched by this.
//
// ponytail: one global gate for one app key; make it a keyed limiter only if a
// second Webull account ever exists.
var MinRequestInterval = 250 * time.Millisecond

var (
	rateGateMu sync.Mutex
	nextSlotAt time.Time
)

// awaitRequestSlot reserves this call's place in the 250ms queue and waits for
// it. Reserving before sleeping is what makes concurrent callers (the quote
// prefetch fans out) queue instead of all firing at once.
func awaitRequestSlot(ctx context.Context) error {
	if MinRequestInterval <= 0 {
		return nil
	}
	now := time.Now()
	rateGateMu.Lock()
	slot := nextSlotAt
	if slot.Before(now) {
		slot = now
	}
	nextSlotAt = slot.Add(MinRequestInterval)
	rateGateMu.Unlock()
	wait := time.Until(slot)
	if wait <= 0 {
		return nil
	}
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// rateLimitRetries / rateLimitBackoff bound the retry of a 429. Webull rate
// limits per endpoint (measured: /account/positions accepts about one call
// every two seconds) and sends no Retry-After header; a dashboard load fires
// balance, positions, accounts, open orders and history at once, so the losing
// call used to come back as a read failure — which the positions table showed
// as "no positions" while the account actually held shares.
const rateLimitRetries = 2

// var so the test can shorten it; production never changes it.
var rateLimitBackoff = time.Second

// doRequest retries a 429 on GET only. A write (order placement, cancel) is
// never resubmitted here: a retried POST could double an order.
func (c *Client) doRequest(ctx context.Context, httpClient *http.Client, method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	for attempt := 0; ; attempt++ {
		out, err := c.doOnce(ctx, httpClient, method, path, query, body, includeToken, extraHeaders)
		if err == nil || method != http.MethodGet || attempt >= rateLimitRetries ||
			out == nil || out.Status != http.StatusTooManyRequests {
			return out, err
		}
		select {
		case <-ctx.Done():
			return out, err
		case <-time.After(time.Duration(attempt+1) * rateLimitBackoff):
		}
	}
}

func (c *Client) doOnce(ctx context.Context, httpClient *http.Client, method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	if err := c.configured(); err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	base, host := c.endpoint()
	var bodyString string
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyBytes = b
		bodyString = string(b)
	}
	ts := time.Now().UTC().Format("2006-01-02T15:04:05Z")
	nonce := strings.ReplaceAll(uuid.NewString(), "-", "")
	headersToSign := map[string]string{
		"host":                  host,
		"x-app-key":             c.AppKey,
		"x-signature-algorithm": "HMAC-SHA1",
		"x-signature-nonce":     nonce,
		"x-signature-version":   "1.0",
		"x-timestamp":           ts,
	}
	sig := BuildSignature(path, query, bodyString, headersToSign, c.AppSecret)
	q := url.Values{}
	for k, v := range query {
		if v != "" {
			q.Set(k, v)
		}
	}
	u := base + path
	if enc := q.Encode(); enc != "" {
		u += "?" + enc
	}
	var rdr io.Reader
	if len(bodyBytes) > 0 {
		rdr = bytes.NewReader(bodyBytes)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Host", host)
	req.Header.Set("x-version", "v2")
	req.Header.Set("x-app-key", c.AppKey)
	req.Header.Set("x-signature-algorithm", "HMAC-SHA1")
	req.Header.Set("x-signature-nonce", nonce)
	req.Header.Set("x-signature-version", "1.0")
	req.Header.Set("x-timestamp", ts)
	req.Header.Set("x-signature", sig)
	if len(bodyBytes) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if tok := c.accessToken(); includeToken && tok != "" {
		req.Header.Set("x-access-token", tok)
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	// Слот берётся здесь, а не в начале функции: между выдачей слота и
	// отправкой лежат кодирование тела, подпись и чтение токена, и запрос,
	// задержавшийся на них, догонял следующий — фактический интервал
	// оказывался меньше заявленного (CORE-05).
	if err := awaitRequestSlot(ctx); err != nil {
		return nil, err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	var parsed any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &parsed)
	}
	out := &Response{Status: resp.StatusCode, Data: parsed, Raw: raw}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := fmt.Sprintf("Webull request failed with %d", resp.StatusCode)
		if m := mapString(parsed, "message", "msg", "error_msg", "error"); m != "" {
			if code := mapString(parsed, "error_code", "errorCode", "code"); code != "" {
				msg = code + ": " + m
			} else {
				msg = m
			}
		}
		return out, fmt.Errorf("%s", msg)
	}
	// HTTP 200 does not mean the request succeeded: Webull can answer 200 with
	// a body carrying a business error code (an order rejection, for
	// instance). Treat any code outside the known-success set as a failure so
	// callers cannot mistake a rejected order for a placed one.
	if code, present := businessCode(parsed); present && !webullBusinessSuccessCodes[code] {
		msg := fmt.Sprintf("Webull business error %s", code)
		if m := mapString(parsed, "message", "msg", "error_msg", "error"); m != "" {
			msg = code + ": " + m
		}
		return out, fmt.Errorf("%s", msg)
	}
	return out, nil
}

func mapString(v any, keys ...string) string {
	m, ok := v.(map[string]any)
	if !ok {
		return ""
	}
	for _, k := range keys {
		if s, ok := m[k].(string); ok && s != "" {
			return s
		}
	}
	return ""
}

func (c *Client) PlaceOrder(accountID string, order map[string]any) (*Response, error) {
	return c.PlaceOrderCtx(context.Background(), accountID, order)
}

// PlaceOrderCtx is PlaceOrder on the trading-path HTTP client (TradeHTTPTimeout),
// with ctx carrying the T-1 deadline: see P1-1 in AUTOTRADE_ROADMAP.md.
func (c *Client) PlaceOrderCtx(ctx context.Context, accountID string, order map[string]any) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	body := map[string]any{
		"account_id": accountID,
		"new_orders": []any{order},
	}
	return c.requestTrade(ctx, http.MethodPost, "/openapi/trade/stock/order/place", nil, body, true, map[string]string{"category": "US_STOCK"})
}

func (c *Client) ListOpenOrders(accountID string, pageSize int) (*Response, error) {
	return c.ListOpenOrdersCtx(context.Background(), accountID, pageSize)
}

// ListOpenOrdersCtx is ListOpenOrders with an explicit context, used from the
// T-1 path (cancelOpenOrdersBeforeEntry, t1BrokerReconcile) so the deadline
// can cancel a stuck read.
func (c *Client) ListOpenOrdersCtx(ctx context.Context, accountID string, pageSize int) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	return c.RequestCtx(ctx, http.MethodGet, "/trade/orders/list-open", map[string]string{
		"account_id": accountID,
		"page_size":  fmt.Sprintf("%d", pageSize),
	}, nil, true, nil)
}

func (c *Client) OrderHistory(accountID, startDate, endDate string, pageSize int) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	if pageSize <= 0 {
		pageSize = 100
	}
	q := map[string]string{
		"account_id": accountID,
		"page_size":  fmt.Sprintf("%d", pageSize),
	}
	if startDate != "" {
		q["start_date"] = startDate
	}
	if endDate != "" {
		q["end_date"] = endDate
	}
	return c.Request(http.MethodGet, "/openapi/trade/order/history", q, nil, true, nil)
}

func (c *Client) CancelOrder(accountID, clientOrderID string) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	return c.Request(http.MethodPost, "/trade/order/cancel", nil, map[string]any{
		"account_id":      accountID,
		"client_order_id": clientOrderID,
	}, true, nil)
}

func (c *Client) OrderDetail(accountID, clientOrderID string) (*Response, error) {
	return c.OrderDetailCtx(context.Background(), accountID, clientOrderID)
}

// OrderDetailCtx is OrderDetail on the trading-path HTTP client
// (TradeHTTPTimeout): placeMarket's landed-order check runs inside the same
// T-1 budget as the placement itself.
func (c *Client) OrderDetailCtx(ctx context.Context, accountID, clientOrderID string) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	return c.requestTrade(ctx, http.MethodGet, "/trade/order/detail", map[string]string{
		"account_id":      accountID,
		"client_order_id": clientOrderID,
	}, nil, true, nil)
}

// AccountList returns the brokerage accounts the app key can see. The Go
// server used to synthesise this list from WEBULL_ACCOUNT_ID, which hid the
// case the config names an account the key does not actually hold — the
// Node server queried this endpoint (getAccountList) for exactly that reason.
func (c *Client) AccountList() (*Response, error) {
	return c.Request(http.MethodGet, "/openapi/account/list", nil, nil, true, nil)
}

func (c *Client) AccountBalance(accountID string) (*Response, error) {
	return c.AccountBalanceCtx(context.Background(), accountID)
}

// AccountBalanceCtx is AccountBalance with an explicit context, used from
// the T-1 sizing path so a stuck account read is bounded by the same deadline.
func (c *Client) AccountBalanceCtx(ctx context.Context, accountID string) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	return c.RequestCtx(ctx, http.MethodGet, "/account/balance", map[string]string{
		"account_id":           accountID,
		"total_asset_currency": "USD",
	}, nil, true, nil)
}

func (c *Client) AccountPositions(accountID string) (*Response, error) {
	return c.AccountPositionsCtx(context.Background(), accountID)
}

// AccountPositionsCtx is AccountPositions with an explicit context, used from
// the T-1 path so a stuck positions read is bounded by the same deadline.
func (c *Client) AccountPositionsCtx(ctx context.Context, accountID string) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	return c.RequestCtx(ctx, http.MethodGet, "/account/positions", map[string]string{
		"account_id": accountID,
		"page_size":  "100",
	}, nil, true, nil)
}

func (c *Client) Instruments(symbol string) (*Response, error) {
	return c.Request(http.MethodGet, "/instrument/list", map[string]string{
		"symbols":  symbol,
		"category": "US_STOCK",
	}, nil, true, nil)
}

func (c *Client) ResolveInstrumentID(symbol string) (string, error) {
	resp, err := c.Instruments(symbol)
	if err != nil {
		return "", err
	}
	// The list endpoint may answer with more than the requested share (a
	// warrant, a dual-listed line). Taking the first row would route a live
	// MARKET order to the wrong instrument (AUD-052), so a row that names a
	// ticker is used only when that ticker is the one asked for. Rows that
	// name none stay usable — the id is all this call needs from them.
	rows := flatten(resp.Data)
	want := strings.ToUpper(strings.TrimSpace(symbol))
	unnamed := ""
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		sym := rowSymbol(m)
		if sym != "" && sym != want {
			continue
		}
		id := instrumentIDOf(m)
		if id == "" {
			continue
		}
		if sym == want {
			return id, nil
		}
		if unnamed == "" {
			unnamed = id
		}
	}
	if unnamed != "" {
		return unnamed, nil
	}
	return "", fmt.Errorf("Unable to resolve Webull instrument_id for %s", symbol)
}

func instrumentIDOf(m map[string]any) string {
	for _, k := range []string{"instrument_id", "instrumentId", "id", "security_id"} {
		if s, ok := m[k].(string); ok && s != "" {
			return s
		}
		if n, ok := m[k].(float64); ok {
			return fmt.Sprintf("%.0f", n)
		}
	}
	return ""
}

// rowSymbol reads the ticker an instrument row carries, upper-cased. An empty
// result means the row cannot be attributed to a ticker and is not usable.
func rowSymbol(m map[string]any) string {
	for _, k := range []string{"symbol", "disSymbol", "display_symbol", "ticker"} {
		if s, ok := m[k].(string); ok && strings.TrimSpace(s) != "" {
			return strings.ToUpper(strings.TrimSpace(s))
		}
	}
	return ""
}

func (c *Client) CreateToken() (*Response, error) {
	return c.Request(http.MethodPost, "/openapi/auth/token/create", nil, map[string]any{}, false, nil)
}

func (c *Client) CheckToken(token string) (*Response, error) {
	return c.Request(http.MethodPost, "/openapi/auth/token/check", nil, map[string]any{"token": token}, false, nil)
}

func (c *Client) TradeCalendar(start, end string) (*Response, error) {
	q := map[string]string{"market": "US"}
	if start != "" {
		q["start"] = start
	}
	if end != "" {
		q["end"] = end
	}
	return c.Request(http.MethodGet, "/trade/calendar", q, nil, true, nil)
}

// Snapshot is GET /openapi/market-data/stock/snapshot. Market data is part of
// the same authenticated OpenAPI surface as trading: without x-access-token the
// endpoint answers INVALID_TOKEN ("Header x-access-token is missing or
// invalid"), so the token goes on this request too. Only token/create and
// token/check are exempt — they are what mints the token in the first place.
func (c *Client) Snapshot(symbols string) (*Response, error) {
	return c.Request(http.MethodGet, "/openapi/market-data/stock/snapshot", map[string]string{
		"symbols":  symbols,
		"category": "US_STOCK",
	}, nil, true, nil)
}

func (c *Client) CorpActions(instrumentID string) (*Response, error) {
	return c.Request(http.MethodGet, "/instrument/corp-action", map[string]string{
		"instrument_ids": instrumentID,
		"event_types":    "302",
	}, nil, true, nil)
}

func flatten(v any) []any {
	if v == nil {
		return nil
	}
	if a, ok := v.([]any); ok {
		return a
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	for _, k := range []string{"data", "result", "items", "list", "rows", "instruments"} {
		if a, ok := m[k].([]any); ok {
			return a
		}
	}
	return nil
}

func NewClientOrderID() string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")
}
