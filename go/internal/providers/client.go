package providers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
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
	WebullToken string
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
		WebullToken: os.Getenv("WEBULL_ACCESS_TOKEN"),
		AlphaBase:   envOr("ALPHA_VANTAGE_BASE", "https://www.alphavantage.co"),
		FinnhubBase: envOr("FINNHUB_BASE", "https://finnhub.io"),
		TwelveBase:  envOr("TWELVE_DATA_BASE", "https://api.twelvedata.com"),
		PolygonBase: envOr("POLYGON_BASE", "https://api.polygon.io"),
	}
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
		return 0, nil, err
	}
	req.Header.Set("User-Agent", "stonks-bot/1.0")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return resp.StatusCode, b, err
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
	if c.WebullToken == "" {
		return QuotePayload{}, &HTTPError{400, "Webull access token not configured"}
	}
	return QuotePayload{}, &HTTPError{501, "Webull snapshot requires signed client"}
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
	var cands []float64
	for _, v := range []any{rng["low"], rng["high"], quote["current"], quote["high"], quote["low"], quote["open"], quote["prevClose"]} {
		if n := finite(v); n != nil {
			cands = append(cands, *n)
		}
	}
	if len(cands) < 2 {
		return nil
	}
	min, max := cands[0], cands[0]
	for _, x := range cands {
		if x < min {
			min = x
		}
		if x > max {
			max = x
		}
	}
	if max <= min {
		return nil
	}
	return map[string]any{"low": min, "high": max}
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
