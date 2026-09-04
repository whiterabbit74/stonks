package providers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/robinhood"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
	"mktorder.com/go/internal/webull"
)

type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string { return e.Message }

type Client struct {
	HTTP        *http.Client
	AlphaKey    string
	FinnhubKey  string
	TwelveKey   string
	PolygonKey  string
	Webull      *webull.Client
	Robinhood   *robinhood.Service
	AlphaBase   string
	FinnhubBase string
	TwelveBase  string
	PolygonBase string
}

func FromEnv() *Client {
	return &Client{
		HTTP:        &http.Client{Timeout: 30 * time.Second},
		AlphaKey:    os.Getenv("ALPHA_VANTAGE_API_KEY"),
		FinnhubKey:  os.Getenv("FINNHUB_API_KEY"),
		TwelveKey:   os.Getenv("TWELVE_DATA_API_KEY"),
		PolygonKey:  os.Getenv("POLYGON_API_KEY"),
		Webull:      webull.FromEnv(),
		AlphaBase:   envOr("ALPHA_VANTAGE_BASE", "https://www.alphavantage.co"),
		FinnhubBase: envOr("FINNHUB_BASE", "https://finnhub.io"),
		TwelveBase:  envOr("TWELVE_DATA_BASE", "https://api.twelvedata.com"),
		PolygonBase: envOr("POLYGON_BASE", "https://api.polygon.io"),
	}
}

// UseWebullToken points the shared Webull client at the live token store.
// Quotes go through the same authenticated OpenAPI as trading, so a client
// built from the environment alone sends no token once the operator keeps the
// token in SQLite — which is what turned every Webull quote into INVALID_TOKEN.
func (c *Client) UseWebullToken(fn func() string) {
	if c == nil || c.Webull == nil || fn == nil {
		return
	}
	c.Webull.Token = fn
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

type QuotePayload struct {
	Range   map[string]any `json:"range"`
	Quote   map[string]any `json:"quote"`
	DateKey string         `json:"dateKey"`
}

type Historical struct {
	Rows   []types.OHLC
	Splits []types.SplitEvent
}

func (c *Client) get(rawURL string) (int, []byte, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, nil, sanitizeTransportError(err)
	}
	req.Header.Set("User-Agent", "stonks-bot/1.0")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, sanitizeTransportError(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return resp.StatusCode, b, sanitizeTransportError(err)
	}
	return resp.StatusCode, b, nil
}

// transportError is an outbound HTTP failure whose Error() never includes the
// request URL. Provider URLs carry apikey/token in the query string; *url.Error
// from Client.Do embeds that URL verbatim (stripPassword only redacts userinfo).
type transportError struct {
	msg string
}

func (e *transportError) Error() string { return e.msg }

var (
	secretQueryRe = regexp.MustCompile(`(?i)((?:api_?key|token)=)([^&\s"'\\]+)`)
	httpURLRe     = regexp.MustCompile(`(?i)https?://[^\s"']+`)
)

func redactSecrets(s string) string {
	return secretQueryRe.ReplaceAllString(s, "${1}REDACTED")
}

func stripURLs(s string) string {
	return strings.TrimSpace(httpURLRe.ReplaceAllString(s, "[url]"))
}

func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}

func unwrapURLErrors(err error) error {
	for err != nil {
		var uerr *url.Error
		if errors.As(err, &uerr) {
			err = uerr.Err
			continue
		}
		return err
	}
	return nil
}

func sanitizeTransportError(err error) error {
	if err == nil {
		return nil
	}
	root := err
	op := "GET"
	host := ""
	var uerr *url.Error
	if errors.As(err, &uerr) {
		if uerr.Op != "" {
			op = uerr.Op
		}
		host = hostOf(uerr.URL)
		root = unwrapURLErrors(uerr.Err)
	}
	msg := op + " request failed"
	if host != "" {
		msg += " host=" + host
	}
	if root != nil {
		msg += ": " + redactSecrets(stripURLs(root.Error()))
	}
	return &transportError{msg: redactSecrets(msg)}
}

func (c *Client) Historical(symbol, provider string, startTs, endTs int64, adjustment string) (Historical, error) {
	symbol = store.SafeTicker(symbol)
	if symbol == "" {
		return Historical{}, &HTTPError{400, "Invalid symbol"}
	}
	switch provider {
	case "alpha_vantage", "":
		return c.alphaHistory(symbol, startTs, endTs, adjustment)
	case "finnhub":
		return c.finnhubHistory(symbol, startTs, endTs)
	case "twelve_data":
		return c.twelveHistory(symbol, startTs, endTs)
	case "polygon":
		return c.polygonHistory(symbol, startTs, endTs)
	case "webull":
		return Historical{}, &HTTPError{400, "Webull не поддерживает загрузку исторических данных. Выберите другой провайдер (Alpha Vantage, Finnhub, Twelve Data или Polygon) в настройках."}
	case "robinhood":
		return c.robinhoodHistory(symbol, startTs, endTs)
	default:
		return Historical{}, &HTTPError{400, "Unknown provider"}
	}
}

func (c *Client) Quote(symbol, provider string) (QuotePayload, error) {
	symbol = store.SafeTicker(symbol)
	if symbol == "" {
		return QuotePayload{}, &HTTPError{400, "Invalid symbol"}
	}
	if provider == "" {
		provider = "finnhub"
	}
	switch provider {
	case "finnhub":
		return c.finnhubQuote(symbol)
	case "webull":
		return c.webullQuote(symbol)
	case "robinhood":
		return c.robinhoodQuote(symbol)
	case "alpha_vantage", "twelve_data", "polygon":
		end := time.Now().Unix()
		start := end - 90*24*60*60
		hist, err := c.Historical(symbol, provider, start, end, "none")
		if err != nil {
			return QuotePayload{}, err
		}
		return BuildQuoteFromRows(hist.Rows)
	default:
		return QuotePayload{}, &HTTPError{400, "Unknown provider"}
	}
}

func (c *Client) GlobalQuotePrice(symbol string) (float64, error) {
	if c.AlphaKey == "" {
		return 0, &HTTPError{400, "API key not configured"}
	}
	u := fmt.Sprintf("%s/query?function=GLOBAL_QUOTE&symbol=%s&apikey=%s", c.AlphaBase, url.QueryEscape(symbol), url.QueryEscape(c.AlphaKey))
	status, body, err := c.get(u)
	if err != nil {
		return 0, err
	}
	if status != 200 {
		return 0, &HTTPError{status, fmt.Sprintf("Alpha Vantage HTTP %d", status)}
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return 0, &HTTPError{502, "Failed to parse Alpha Vantage response"}
	}
	if jsonData["Note"] != nil || jsonData["Information"] != nil {
		return 0, &HTTPError{429, "Достигнут лимит API Alpha Vantage"}
	}
	gq, _ := jsonData["Global Quote"].(map[string]any)
	raw, _ := gq["05. price"].(string)
	p, _ := strconv.ParseFloat(raw, 64)
	if p == 0 {
		return 0, &HTTPError{404, "No data returned from provider"}
	}
	return p, nil
}

func (c *Client) TwelvePrice(symbol string) (float64, error) {
	if c.TwelveKey == "" {
		return 0, &HTTPError{400, "API key not configured"}
	}
	u := fmt.Sprintf("%s/price?symbol=%s&apikey=%s", c.TwelveBase, url.QueryEscape(symbol), url.QueryEscape(c.TwelveKey))
	_, body, err := c.get(u)
	if err != nil {
		return 0, err
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return 0, err
	}
	if jsonData["status"] == "error" {
		return 0, fmt.Errorf("Twelve Data: %v", jsonData["message"])
	}
	p, _ := strconv.ParseFloat(fmt.Sprint(jsonData["price"]), 64)
	return p, nil
}

func (c *Client) alphaHistory(symbol string, startTs, endTs int64, adjustment string) (Historical, error) {
	if c.AlphaKey == "" {
		return Historical{}, &HTTPError{400, "Alpha Vantage API key not configured"}
	}
	fn := "TIME_SERIES_DAILY"
	if adjustment == "split_only" {
		fn = "TIME_SERIES_DAILY_ADJUSTED"
	}
	u := fmt.Sprintf("%s/query?function=%s&symbol=%s&apikey=%s&outputsize=full&random=%d",
		c.AlphaBase, fn, url.QueryEscape(symbol), url.QueryEscape(c.AlphaKey), time.Now().UnixMilli())
	status, body, err := c.get(u)
	if err != nil {
		return Historical{}, err
	}
	if len(body) > 0 && body[0] == '<' {
		return Historical{}, &HTTPError{502, "Провайдер вернул HTML вместо JSON (возможен лимит/блокировка)."}
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return Historical{}, &HTTPError{502, err.Error()}
	}
	if msg, _ := jsonData["Error Message"].(string); msg != "" {
		return Historical{}, &HTTPError{400, "Alpha Vantage: " + msg}
	}
	if jsonData["Note"] != nil || jsonData["Information"] != nil {
		note := jsonData["Note"]
		if note == nil {
			note = jsonData["Information"]
		}
		return Historical{}, &HTTPError{429, fmt.Sprintf("Достигнут лимит API Alpha Vantage: %v", note)}
	}
	series, _ := jsonData["Time Series (Daily)"].(map[string]any)
	if series == nil {
		return Historical{}, &HTTPError{statusOr(status, 502), "Отсутствует секция \"Time Series (Daily)\" в ответе Alpha Vantage"}
	}
	start := time.Unix(startTs, 0).UTC()
	end := time.Unix(endTs, 0).UTC()
	var rows []types.OHLC
	for date, raw := range series {
		t, err := time.Parse("2006-01-02", date)
		if err != nil {
			continue
		}
		if t.Before(start) || t.After(end) {
			continue
		}
		vals, _ := raw.(map[string]any)
		row := types.OHLC{Date: date, Volume: num(vals["6. volume"])}
		row.Open, row.High, row.Low, row.Close = num(vals["1. open"]), num(vals["2. high"]), num(vals["3. low"]), num(vals["4. close"])
		adj := row.Close
		if v := num(vals["5. adjusted close"]); v != 0 {
			adj = v
		}
		row.AdjClose = &adj
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Date < rows[j].Date })
	return Historical{Rows: rows}, nil
}

func (c *Client) finnhubHistory(symbol string, startTs, endTs int64) (Historical, error) {
	if c.FinnhubKey == "" {
		return Historical{}, &HTTPError{400, "Finnhub API key not configured"}
	}
	u := fmt.Sprintf("%s/api/v1/stock/candle?symbol=%s&resolution=D&from=%d&to=%d&token=%s",
		c.FinnhubBase, url.QueryEscape(symbol), startTs, endTs, url.QueryEscape(c.FinnhubKey))
	status, body, err := c.get(u)
	if err != nil {
		return Historical{}, err
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return Historical{}, &HTTPError{502, "Finnhub: invalid JSON"}
	}
	if s, _ := jsonData["s"].(string); s != "ok" {
		st := 400
		if s == "no_data" {
			st = 404
		}
		return Historical{}, &HTTPError{st, fmt.Sprintf("Finnhub: %v", jsonData["s"])}
	}
	ts := floatArr(jsonData["t"])
	o, h, l, cl, v := floatArr(jsonData["o"]), floatArr(jsonData["h"]), floatArr(jsonData["l"]), floatArr(jsonData["c"]), floatArr(jsonData["v"])
	if len(o) != len(ts) || len(h) != len(ts) || len(l) != len(ts) || len(cl) != len(ts) || len(v) != len(ts) {
		return Historical{}, &HTTPError{502, "Finnhub: mismatched candle arrays"}
	}
	var rows []types.OHLC
	for i := range ts {
		date := time.Unix(int64(ts[i]), 0).UTC().Format("2006-01-02")
		adj := cl[i]
		rows = append(rows, types.OHLC{Date: date, Open: o[i], High: h[i], Low: l[i], Close: cl[i], AdjClose: &adj, Volume: v[i]})
	}
	_ = status
	return Historical{Rows: rows}, nil
}

func (c *Client) finnhubQuote(symbol string) (QuotePayload, error) {
	if c.FinnhubKey == "" {
		return QuotePayload{}, &HTTPError{400, "Finnhub API key not configured"}
	}
	u := fmt.Sprintf("%s/api/v1/quote?symbol=%s&token=%s", c.FinnhubBase, url.QueryEscape(symbol), url.QueryEscape(c.FinnhubKey))
	status, body, err := c.get(u)
	if err != nil {
		return QuotePayload{}, err
	}
	var q map[string]any
	if err := json.Unmarshal(body, &q); err != nil {
		return QuotePayload{}, &HTTPError{502, "Finnhub quote: invalid JSON"}
	}
	if status != 0 && status != 200 {
		return QuotePayload{}, &HTTPError{status, fmt.Sprintf("Finnhub quote: HTTP %d", status)}
	}
	current := num(q["c"])
	if current == 0 {
		return QuotePayload{}, &HTTPError{404, "Finnhub quote: no price for " + symbol}
	}
	today := tradingdate.TodayNYSE(time.Now())
	open, high, low, pc := num(q["o"]), num(q["h"]), num(q["l"]), num(q["pc"])
	return QuotePayload{
		Range:   map[string]any{"open": open, "high": high, "low": low},
		Quote:   map[string]any{"open": open, "high": high, "low": low, "current": current, "prevClose": pc},
		DateKey: today,
	}, nil
}

func (c *Client) twelveHistory(symbol string, startTs, endTs int64) (Historical, error) {
	if c.TwelveKey == "" {
		return Historical{}, &HTTPError{400, "Twelve Data API key not configured"}
	}
	start := time.Unix(startTs, 0).UTC().Format("2006-01-02")
	end := time.Unix(endTs, 0).UTC().Format("2006-01-02")
	u := fmt.Sprintf("%s/time_series?symbol=%s&interval=1day&start_date=%s&end_date=%s&apikey=%s&outputsize=5000",
		c.TwelveBase, url.QueryEscape(symbol), start, end, url.QueryEscape(c.TwelveKey))
	_, body, err := c.get(u)
	if err != nil {
		return Historical{}, err
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return Historical{}, err
	}
	if jsonData["status"] == "error" {
		return Historical{}, fmt.Errorf("Twelve Data: %v", jsonData["message"])
	}
	values, _ := jsonData["values"].([]any)
	var rows []types.OHLC
	for _, raw := range values {
		m, _ := raw.(map[string]any)
		date := strings.Split(fmt.Sprint(m["datetime"]), " ")[0]
		adj := num(m["close"])
		rows = append(rows, types.OHLC{
			Date: date, Open: num(m["open"]), High: num(m["high"]), Low: num(m["low"]), Close: num(m["close"]),
			AdjClose: &adj, Volume: num(m["volume"]),
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Date < rows[j].Date })
	if len(rows) == 0 {
		return Historical{}, &HTTPError{404, "Twelve Data: No data found for this symbol/period"}
	}
	return Historical{Rows: rows}, nil
}

func (c *Client) polygonHistory(symbol string, startTs, endTs int64) (Historical, error) {
	if c.PolygonKey == "" {
		return Historical{}, &HTTPError{400, "Polygon API key not configured"}
	}
	from := time.Unix(startTs, 0).UTC().Format("2006-01-02")
	to := time.Unix(endTs, 0).UTC().Format("2006-01-02")
	u := fmt.Sprintf("%s/v2/aggs/ticker/%s/range/1/day/%s/%s?adjusted=true&sort=asc&limit=50000&apikey=%s",
		c.PolygonBase, url.PathEscape(symbol), from, to, url.QueryEscape(c.PolygonKey))
	status, body, err := c.get(u)
	if err != nil {
		return Historical{}, err
	}
	if status != 200 {
		return Historical{}, &HTTPError{status, fmt.Sprintf("Polygon API returned status %d", status)}
	}
	var jsonData map[string]any
	if err := json.Unmarshal(body, &jsonData); err != nil {
		return Historical{}, fmt.Errorf("Failed to parse Polygon API response")
	}
	if jsonData["status"] == "ERROR" {
		return Historical{}, fmt.Errorf("%v", jsonData["error"])
	}
	results, _ := jsonData["results"].([]any)
	var rows []types.OHLC
	for _, raw := range results {
		m, _ := raw.(map[string]any)
		ms := int64(num(m["t"]))
		date := time.UnixMilli(ms).UTC().Format("2006-01-02")
		adj := num(m["c"])
		rows = append(rows, types.OHLC{
			Date: date, Open: num(m["o"]), High: num(m["h"]), Low: num(m["l"]), Close: num(m["c"]),
			AdjClose: &adj, Volume: num(m["v"]),
		})
	}
	if len(rows) == 0 {
		return Historical{}, fmt.Errorf("No data available for this symbol and date range")
	}
	return Historical{Rows: rows}, nil
}

func (c *Client) webullQuote(symbol string) (QuotePayload, error) {
	if c.Webull == nil {
		return QuotePayload{}, &HTTPError{400, "Webull credentials are not configured"}
	}
	resp, err := c.Webull.Snapshot(symbol)
	if err != nil {
		status := 502
		if resp != nil && resp.Status >= 400 {
			status = resp.Status
		} else if strings.Contains(err.Error(), "credentials") {
			status = 400
		}
		return QuotePayload{}, &HTTPError{status, err.Error()}
	}
	row := pickSnapshotRow(resp.Data, symbol)
	if row == nil {
		return QuotePayload{}, &HTTPError{404, "Webull snapshot: no data for " + symbol}
	}
	return snapshotPayload(row), nil
}

// WebullBatchMax caps the symbols put in one snapshot request.
const WebullBatchMax = 50

// QuoteBatch fetches several symbols in a single provider call where the
// provider has an endpoint for it. Webull's snapshot takes `symbols` plural
// and answers with a row per symbol, so a whole watch list costs one signed
// request instead of one per ticker — fewer calls, fewer chances for a single
// flaky reply to decide the day.
//
// A provider without a batch endpoint returns (nil, nil): callers keep their
// per-symbol path, which also owns the provider fallback chain. The same is
// true for any symbol missing from the reply, so an endpoint that turns out to
// answer for one symbol only still works, just without the saving.
func (c *Client) QuoteBatch(symbols []string, provider string) (map[string]QuotePayload, error) {
	if provider != "webull" {
		return nil, nil
	}
	if c.Webull == nil {
		return nil, &HTTPError{400, "Webull credentials are not configured"}
	}
	want := map[string]bool{}
	var clean []string
	for _, s := range symbols {
		sym := store.SafeTicker(s)
		if sym == "" || want[sym] {
			continue
		}
		want[sym] = true
		clean = append(clean, sym)
	}
	if len(clean) == 0 {
		return nil, nil
	}
	out := map[string]QuotePayload{}
	for start := 0; start < len(clean); start += WebullBatchMax {
		end := start + WebullBatchMax
		if end > len(clean) {
			end = len(clean)
		}
		chunk := clean[start:end]
		resp, err := c.Webull.Snapshot(strings.Join(chunk, ","))
		if err != nil {
			status := 502
			if resp != nil && resp.Status >= 400 {
				status = resp.Status
			}
			return out, &HTTPError{status, err.Error()}
		}
		for _, raw := range snapshotRows(resp.Data) {
			row, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			// Strict symbol match: unlike the single-symbol path there is no
			// "first row wins" fallback here — a mislabelled row would hand one
			// ticker's IBS to another.
			sym := store.SafeTicker(rowSymbol(row))
			if sym == "" || !want[sym] {
				continue
			}
			out[sym] = snapshotPayload(row)
		}
	}
	return out, nil
}

func snapshotPayload(row map[string]any) QuotePayload {
	open := pickNum(row, "open", "openPrice", "open_price", "o")
	high := pickNum(row, "high", "highPrice", "high_price", "day_high", "h")
	low := pickNum(row, "low", "lowPrice", "low_price", "day_low", "l")
	// price = live last; close during RTH is typically yesterday's close.
	current := pickNum(row, "price", "lastPrice", "last_price", "tradePrice", "trade_price", "current", "c", "close")
	prevClose := pickNum(row, "pre_close", "preClose", "prev_close", "prevClose", "previousClose", "pc")
	today := tradingdate.TodayNYSE(time.Now())
	return QuotePayload{
		Range:   map[string]any{"open": open, "high": high, "low": low},
		Quote:   map[string]any{"open": open, "high": high, "low": low, "current": current, "prevClose": prevClose},
		DateKey: today,
	}
}

func rowSymbol(row map[string]any) string {
	for _, k := range []string{"symbol", "ticker", "disSymbol", "display_symbol"} {
		if s, ok := row[k].(string); ok && s != "" {
			return s
		}
	}
	return ""
}

func pickSnapshotRow(data any, symbol string) map[string]any {
	rows := snapshotRows(data)
	want := strings.ToUpper(symbol)
	var first map[string]any
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		if first == nil {
			first = m
		}
		if strings.ToUpper(rowSymbol(m)) == want {
			return m
		}
	}
	return first
}

func snapshotRows(v any) []any {
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
	return []any{m}
}

func pickNum(row map[string]any, keys ...string) any {
	for _, k := range keys {
		v, ok := row[k]
		if !ok || v == nil {
			continue
		}
		switch n := v.(type) {
		case float64:
			if n == n {
				return n
			}
		case json.Number:
			f, err := n.Float64()
			if err == nil && f == f {
				return f
			}
		case string:
			if strings.TrimSpace(n) == "" {
				continue
			}
			f, err := strconv.ParseFloat(n, 64)
			if err == nil && f == f {
				return f
			}
		case int:
			return float64(n)
		case int64:
			return float64(n)
		}
	}
	return nil
}

func BuildQuoteFromRows(rows []types.OHLC) (QuotePayload, error) {
	if len(rows) == 0 {
		return QuotePayload{}, &HTTPError{404, "No quote data returned"}
	}
	ordered := append([]types.OHLC(nil), rows...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Date < ordered[j].Date })
	last := ordered[len(ordered)-1]
	var prev *types.OHLC
	if len(ordered) > 1 {
		prev = &ordered[len(ordered)-2]
	}
	open, high, low, current := last.Open, last.High, last.Low, last.Close
	var prevClose any
	if prev != nil {
		prevClose = prev.Close
	}
	return QuotePayload{
		Range:   map[string]any{"open": open, "high": high, "low": low},
		Quote:   map[string]any{"open": open, "high": high, "low": low, "current": current, "prevClose": prevClose},
		DateKey: last.Date,
	}, nil
}

func NormalizeIntradayRange(rng, quote map[string]any) map[string]any {
	low := finite(rng["low"])
	high := finite(rng["high"])
	if low != nil && high != nil && *high > *low {
		return map[string]any{"low": *low, "high": *high}
	}
	// Fall back only to the quote's own session high/low. Never synthesise a
	// range from current/prevClose: that pins current to an edge and produces
	// IBS 0 or 1, which then wins the entry ranking.
	qLow := finite(quote["low"])
	qHigh := finite(quote["high"])
	if qLow != nil && qHigh != nil && *qHigh > *qLow {
		return map[string]any{"low": *qLow, "high": *qHigh}
	}
	return nil
}

func finite(v any) *float64 {
	switch n := v.(type) {
	case float64:
		if n == n {
			return &n
		}
	case int:
		f := float64(n)
		return &f
	}
	return nil
}

func num(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	case int:
		return float64(n)
	}
	return 0
}

func floatArr(v any) []float64 {
	arr, _ := v.([]any)
	out := make([]float64, len(arr))
	for i, x := range arr {
		out[i] = num(x)
	}
	return out
}

func statusOr(status, fallback int) int {
	if status == 0 {
		return fallback
	}
	return status
}
