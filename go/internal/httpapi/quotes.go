package httpapi

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
)

func (s *Server) handleWebullBatch(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("symbols")
	parts := strings.Split(raw, ",")
	var symbols []string
	for _, p := range parts {
		if s := store.SafeTicker(strings.TrimSpace(p)); s != "" {
			symbols = append(symbols, s)
		}
	}
	if len(symbols) == 0 {
		writeJSON(w, 400, map[string]any{"error": "Нет корректных тикеров"})
		return
	}
	if len(symbols) > 50 {
		writeJSON(w, 400, map[string]any{"error": "Слишком много тикеров (максимум 50)"})
		return
	}
	// One snapshot request for the whole list; anything it does not answer for
	// falls back to a single-symbol call below.
	batch, _ := s.Providers.QuoteBatch(symbols, "webull")
	var results []map[string]any
	for _, symbol := range symbols {
		payload, ok := batch[symbol]
		if !ok {
			var err error
			payload, err = s.Providers.Quote(symbol, "webull")
			if err != nil {
				results = append(results, map[string]any{"symbol": symbol, "error": err.Error()})
				continue
			}
		}
		norm := providers.NormalizeIntradayRange(payload.Range, payload.Quote)
		results = append(results, map[string]any{
			"symbol": symbol, "dateKey": payload.DateKey, "range": norm, "quote": payload.Quote, "provider": "webull",
		})
	}
	writeJSON(w, 200, map[string]any{"provider": "webull", "count": len(results), "results": results})
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		provider = "finnhub"
	}
	allowed := map[string]bool{"alpha_vantage": true, "finnhub": true, "twelve_data": true, "polygon": true, "webull": true, "robinhood": true}
	if !allowed[provider] {
		provider = "finnhub"
	}
	payload, err := s.Providers.Quote(sym, provider)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	norm := providers.NormalizeIntradayRange(payload.Range, payload.Quote)
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "dateKey": payload.DateKey, "range": norm, "quote": payload.Quote, "provider": provider,
	})
}

func (s *Server) handleYahooFinance(w http.ResponseWriter, r *http.Request) {
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	nowTs := time.Now().Unix()
	endTs := parseUnix(r.URL.Query().Get("end"), nowTs)
	startTs := parseUnix(r.URL.Query().Get("start"), endTs-40*365*24*60*60)
	if startTs >= endTs {
		writeJSON(w, 400, map[string]any{"error": "Неверный диапазон дат"})
		return
	}
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		provider = "alpha_vantage"
	}
	adjustment := "none"
	if r.URL.Query().Get("adjustment") == "split_only" {
		adjustment = "split_only"
	}
	if provider == "webull" {
		writeJSON(w, 400, map[string]any{"error": "Webull не поддерживает загрузку исторических данных. Выберите другой провайдер (Alpha Vantage, Finnhub, Twelve Data или Polygon) в настройках."})
		return
	}
	hist, err := s.Providers.Historical(sym, provider, startTs, endTs, adjustment)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "provider": provider, "dataPoints": len(hist.Rows), "data": hist.Rows, "splits": hist.Splits,
	})
}

func (s *Server) handleFetchProvider(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	endTs := time.Now().Unix()
	startTs := endTs - 40*365*24*60*60
	if provider == "webull" {
		payload, err := s.Providers.Quote(sym, "webull")
		if err != nil {
			writeProviderError(w, err)
			return
		}
		q := payload.Quote
		data := []map[string]any{{
			"date": payload.DateKey, "open": q["open"], "high": q["high"], "low": q["low"],
			"close": q["current"], "adjClose": q["current"], "volume": nil,
		}}
		writeJSON(w, 200, map[string]any{"symbol": sym, "provider": provider, "dataPoints": 1, "data": data, "splits": []any{}})
		return
	}
	hist, err := s.Providers.Historical(sym, provider, startTs, endTs, "none")
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "provider": provider, "dataPoints": len(hist.Rows), "data": hist.Rows, "splits": hist.Splits,
	})
}

func (s *Server) handleTestAlpha(w http.ResponseWriter, r *http.Request) {
	if s.Providers.AlphaKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "alpha_vantage", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestFinnhub(w http.ResponseWriter, r *http.Request) {
	if s.Providers.FinnhubKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "finnhub", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestTwelve(w http.ResponseWriter, r *http.Request) {
	if s.Providers.TwelveKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "twelve_data", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestProvider(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := readJSON(r, &body); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, 400, map[string]any{"success": false, "error": "invalid json"})
		return
	}
	provider, _ := body["provider"].(string)
	symbol := "AAPL"
	endTs := time.Now().Unix()
	startTs := endTs - 7*24*60*60
	switch provider {
	case "alpha_vantage":
		if s.Providers.AlphaKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		price, err := s.Providers.GlobalQuotePrice(symbol)
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": strconv.FormatFloat(price, 'f', 2, 64)})
	case "finnhub":
		if s.Providers.FinnhubKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		q, err := s.Providers.Quote(symbol, "finnhub")
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
			return
		}
		price := q.Quote["current"]
		if price == nil {
			price = q.Quote["prevClose"]
		}
		if price == nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": "Провайдер не вернул данные"})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": fmtFloat(price)})
	case "twelve_data":
		if s.Providers.TwelveKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		price, err := s.Providers.TwelvePrice(symbol)
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": strconv.FormatFloat(price, 'f', 2, 64)})
	case "polygon":
		if s.Providers.PolygonKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		hist, err := s.Providers.Historical(symbol, "polygon", startTs, endTs, "none")
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
			return
		}
		if len(hist.Rows) == 0 {
			writeJSON(w, 200, map[string]any{"success": false, "error": "Провайдер не вернул данные"})
			return
		}
		price := hist.Rows[len(hist.Rows)-1].Close
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": strconv.FormatFloat(price, 'f', 2, 64)})
	case "webull":
		q, err := s.Providers.Quote(symbol, "webull")
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": publicErr(err)})
			return
		}
		price := q.Quote["current"]
		if price == nil {
			price = q.Quote["prevClose"]
		}
		if price == nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": "Провайдер не вернул данные"})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": fmtFloat(price)})
	default:
		writeJSON(w, 400, map[string]any{"success": false, "error": "Неизвестный провайдер"})
	}
}

func writeProviderError(w http.ResponseWriter, err error) {
	if he, ok := err.(*providers.HTTPError); ok {
		code := he.Status
		if code < 400 {
			code = 500
		}
		if code == 401 || code == 403 {
			code = 502
		}
		writeJSON(w, code, map[string]any{"error": he.Message})
		return
	}
	writeJSON(w, 500, map[string]any{"error": publicErr(err)})
}

var secretQueryRe = regexp.MustCompile(`(?i)(apikey|api_key|access_token|token|password)=[^&\s]+`)

func publicErr(err error) string {
	if err == nil {
		return ""
	}
	if he, ok := err.(*providers.HTTPError); ok {
		return he.Message
	}
	var ue *url.Error
	if errors.As(err, &ue) {
		msg := ue.Op
		if ue.Err != nil {
			if msg != "" {
				msg += ": "
			}
			msg += ue.Err.Error()
		}
		return secretQueryRe.ReplaceAllString(msg, "$1=[redacted]")
	}
	return secretQueryRe.ReplaceAllString(err.Error(), "$1=[redacted]")
}

func parseUnix(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func fmtFloat(v any) string {
	f, ok := v.(float64)
	if !ok {
		return "0.00"
	}
	return strconv.FormatFloat(f, 'f', 2, 64)
}
