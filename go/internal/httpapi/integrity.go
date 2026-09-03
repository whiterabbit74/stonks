package httpapi

import (
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func validateBars(bars []types.OHLC) []string {
	if len(bars) == 0 {
		return []string{"empty bars"}
	}
	var reasons []string
	seen := make(map[string]bool, len(bars))
	prev := ""
	nonMono := false
	for _, b := range bars {
		d := tradingdate.DateKey(b.Date)
		if d == "" {
			reasons = append(reasons, "missing date")
			continue
		}
		if seen[d] {
			reasons = append(reasons, "duplicate date "+d)
		}
		seen[d] = true
		if prev != "" && d < prev && !nonMono {
			reasons = append(reasons, "non-monotonic dates")
			nonMono = true
		}
		prev = d
		if b.High < b.Low {
			reasons = append(reasons, "high < low on "+d)
		}
	}
	return reasons
}
