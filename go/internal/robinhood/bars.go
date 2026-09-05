package robinhood

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"mktorder.com/go/internal/types"
)

func TradingDateFromBeginsAt(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 10 {
		return s[:10]
	}
	return ""
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f
	default:
		return 0
	}
}

func asBool(v any) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return strings.EqualFold(b, "true") || b == "1"
	default:
		return false
	}
}

func ParseHistoricals(raw []byte) []types.OHLC {
	return ParseHistoricalsSymbol(raw, "")
}

func ParseHistoricalsSymbol(raw []byte, symbol string) []types.OHLC {
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return nil
	}
	var out []types.OHLC
	walkHistoricals(root, strings.ToUpper(strings.TrimSpace(symbol)), &out)
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out
}

func walkHistoricals(v any, want string, out *[]types.OHLC) {
	switch t := v.(type) {
	case map[string]any:
		if begins, ok := t["begins_at"]; ok {
			if asBool(t["interpolated"]) {
				return
			}
			if want != "" {
				got := strings.ToUpper(strings.TrimSpace(fmtString(first(t, "symbol", "ticker"))))
				if got != "" && got != want {
					return
				}
			}
			date := TradingDateFromBeginsAt(fmtString(begins))
			if date == "" {
				return
			}
			*out = append(*out, types.OHLC{
				Date:   date,
				Open:   asFloat(first(t, "open_price", "open")),
				High:   asFloat(first(t, "high_price", "high")),
				Low:    asFloat(first(t, "low_price", "low")),
				Close:  asFloat(first(t, "close_price", "close")),
				Volume: asFloat(first(t, "volume")),
			})
			return
		}
		for _, child := range t {
			walkHistoricals(child, want, out)
		}
	case []any:
		for _, child := range t {
			walkHistoricals(child, want, out)
		}
	}
}

func first(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

func fmtString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func ChunkStrings(in []string, n int) [][]string {
	if n <= 0 {
		n = 10
	}
	var out [][]string
	for len(in) > 0 {
		if len(in) < n {
			out = append(out, in)
			break
		}
		out = append(out, in[:n])
		in = in[n:]
	}
	return out
}
