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
		return fmt.Errorf("Webull credentials are not configured")
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
	if c.HTTP == nil {
		c.HTTP = &http.Client{Timeout: 15 * time.Second}
	}
	return c.HTTP
}

func (c *Client) tradeHTTPClient() *http.Client {
	if c.TradeHTTP == nil {
		c.TradeHTTP = &http.Client{Timeout: TradeHTTPTimeout}
	}
	return c.TradeHTTP
}

func (c *Client) doRequest(ctx context.Context, httpClient *http.Client, method, path string, query map[string]string, body any, includeToken bool, extraHeaders map[string]string) (*Response, error) {
	if err := c.configured(); err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if c.Base == "" {
		c.Base = "https://api.webull.com"
	}
	if c.Host == "" {
		c.Host = "api.webull.com"
	}
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
		"host":                  c.Host,
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
	u := c.Base + path
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
	req.Header.Set("Host", c.Host)
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

func (c *Client) AccountBalance(accountID string) (*Response, error) {
	if accountID == "" {
		accountID = c.AccountID
	}
	return c.Request(http.MethodGet, "/account/balance", map[string]string{
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
	rows := flatten(resp.Data)
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		for _, k := range []string{"instrument_id", "instrumentId", "id", "security_id"} {
			if s, ok := m[k].(string); ok && s != "" {
				return s, nil
			}
			if n, ok := m[k].(float64); ok {
				return fmt.Sprintf("%.0f", n), nil
			}
		}
	}
	return "", fmt.Errorf("Unable to resolve Webull instrument_id for %s", symbol)
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
