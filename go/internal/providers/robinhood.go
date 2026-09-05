package providers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"mktorder.com/go/internal/robinhood"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func (c *Client) robinhoodHistory(symbol string, startTs, endTs int64) (Historical, error) {
	if c.Robinhood == nil {
		return Historical{}, &HTTPError{400, "Robinhood is not connected"}
	}
	start := time.Unix(startTs, 0).UTC().Format("2006-01-02T00:00:00Z")
	raw, err := c.Robinhood.CallTool("get_equity_historicals", map[string]any{
		"symbols": []string{symbol}, "start_time": start, "interval": "day",
		"bounds": "regular", "adjustment_type": "split",
	})
	if err != nil {
		return Historical{}, robinhoodProviderErr(err)
	}
	bars := robinhood.ParseHistoricalsSymbol(robinhood.ToolContentJSON(raw), symbol)
	end := ""
	if endTs > 0 {
		end = time.Unix(endTs, 0).UTC().Format("2006-01-02")
	}
	var out []types.OHLC
	for _, b := range bars {
		if end != "" && b.Date > end {
			continue
		}
		out = append(out, b)
	}
	return Historical{Rows: out}, nil
}

func (c *Client) robinhoodQuote(symbol string) (QuotePayload, error) {
	if c.Robinhood == nil {
		return QuotePayload{}, &HTTPError{400, "Robinhood is not connected"}
	}
	raw, err := c.Robinhood.CallTool("get_equity_quotes", map[string]any{"symbols": []string{symbol}})
	if err != nil {
		return QuotePayload{}, robinhoodProviderErr(err)
	}
	q := mapFromJSON(robinhood.ToolContentJSON(raw))
	open := robinhoodFloat(q, "open", "open_price")
	high := robinhoodFloat(q, "high", "high_price")
	low := robinhoodFloat(q, "low", "low_price")
	// last_extended_hours_trade_price is deliberately excluded (P2-6): it is a
	// postmarket print, and ibsFromQuote clamps IBS to [0,1], so an
	// after-hours price outside the regular session's [low, high] range would
	// silently read as a "perfect" 0 or 1 entry/exit signal instead of the
	// garbage it is.
	cur := robinhoodFloat(q, "last_trade_price", "price", "close")
	prev := robinhoodFloat(q, "previous_close", "adjusted_previous_close")
	return QuotePayload{
		Range:   map[string]any{"open": open, "high": high, "low": low},
		Quote:   map[string]any{"open": open, "high": high, "low": low, "current": cur, "prevClose": prev},
		DateKey: tradingdate.TodayNYSE(time.Now()),
	}, nil
}

func robinhoodProviderErr(err error) error {
	msg := err.Error()
	if strings.Contains(msg, "NEEDS_REAUTH") || strings.Contains(msg, "unauthorized") {
		return &HTTPError{401, "Robinhood requires reauthorization"}
	}
	return &HTTPError{502, fmt.Sprintf("Robinhood: %s", msg)}
}

func robinhoodFloat(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return asFloatAny(v)
		}
	}
	return 0
}

func asFloatAny(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case string:
		var f float64
		fmt.Sscanf(n, "%f", &f)
		return f
	default:
		return 0
	}
}

func mapFromJSON(raw []byte) map[string]any {
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return map[string]any{}
	}
	if m := firstQuoteMap(root); m != nil {
		return m
	}
	return map[string]any{}
}

func firstQuoteMap(v any) map[string]any {
	switch t := v.(type) {
	case map[string]any:
		if t["last_trade_price"] != nil || t["last_extended_hours_trade_price"] != nil || t["symbol"] != nil {
			return t
		}
		for _, c := range t {
			if m := firstQuoteMap(c); m != nil {
				return m
			}
		}
	case []any:
		for _, c := range t {
			if m := firstQuoteMap(c); m != nil {
				return m
			}
		}
	}
	return nil
}
