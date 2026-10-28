package live

import (
	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
)

// The monitoring's decision (CORE §3.1). Everything in this file is a plain
// function of the readings, the watch list and the monitoring's own position:
// no Engine, no broker, no autotrade config can be reached from here.

// LiveQuote is one ticker's reading in an evaluation cycle: the IBS the
// decision compares, the thresholds it compares against, and whether the
// reading is usable at all. the decision used to walk map[string]any rows,
// where a missing "ibs" key read as 0 — an entry signal — and a mistyped key
// name was not a compile error. The JSON shape is unchanged: the SPA and the
// stored last result still see the same keys.
type LiveQuote struct {
	Symbol       string          `json:"symbol"`
	OK           bool            `json:"ok"`
	IBS          float64         `json:"ibs"`
	CurrentPrice float64         `json:"currentPrice"`
	Thresholds   QuoteThresholds `json:"thresholds"`
}

type QuoteThresholds struct {
	LowIBS  float64 `json:"lowIBS"`
	HighIBS float64 `json:"highIBS"`
}

// decideMonitor is the monitoring's decision on one set of readings: exit its
// position on the exit signal, otherwise — holding nothing — enter the watched
// ticker with the lowest IBS strictly below its threshold.
func decideMonitor(quotes []LiveQuote, symbols []string, open *store.Position) map[string]any {
	none := func(reason string, symbol any, cand any) map[string]any {
		return map[string]any{"action": "none", "reason": reason, "symbol": symbol, "candidate": cand}
	}
	if open != nil {
		row := exitSignalQuote(quotes, open.Symbol)
		if exitSignalFired(row) {
			return map[string]any{"action": "exit", "reason": "ibs_exit", "symbol": open.Symbol, "candidate": row}
		}
		if row == nil {
			return none("open_position_quote_unavailable", open.Symbol, nil)
		}
		return none("exit_threshold_not_reached", open.Symbol, row)
	}
	if len(symbols) == 0 {
		return none("empty_symbol_universe", nil, nil)
	}
	watched := map[string]bool{}
	for _, s := range symbols {
		watched[store.SafeTicker(s)] = true
	}
	var best *LiveQuote
	for i, q := range quotes {
		if !q.OK || !watched[store.SafeTicker(q.Symbol)] {
			continue
		}
		low, _ := q.resolvedThresholds()
		if ibs.IsEntrySignal(q.IBS, low) && (best == nil || q.IBS < best.IBS) {
			best = &quotes[i]
		}
	}
	if best != nil {
		return map[string]any{"action": "entry", "reason": "lowest_ibs_signal", "symbol": best.Symbol, "candidate": best}
	}
	return none("no_signal", nil, nil)
}

// exitSignalQuote is the usable reading for this ticker in the cycle: the row
// the exit decision is taken on, and the row its price and IBS are logged from.
func exitSignalQuote(quotes []LiveQuote, symbol string) *LiveQuote {
	for i, q := range quotes {
		if q.Symbol == symbol && q.OK {
			return &quotes[i]
		}
	}
	return nil
}

func exitSignalFired(row *LiveQuote) bool {
	if row == nil {
		return false
	}
	_, high := row.resolvedThresholds()
	return ibs.IsExitSignal(row.IBS, high)
}

// candidateIBS reads the reading a decision was taken on. The decision map is
// still the JSON-shaped result the SPA and Telegram consume; its candidate is
// the typed quote row.
func candidateIBS(dec map[string]any) float64 {
	if cand, ok := dec["candidate"].(*LiveQuote); ok && cand != nil {
		return cand.IBS
	}
	return 0
}

// resolvedThresholds re-checks the pair watchThresholds put on the row: the
// decision is the last place it can still be sent back to the documented
// defaults before an order is priced on it. The pair is checked as a pair —
// a zero-valued QuoteThresholds is a highIBS of 0, which on its own reads as a
// threshold in range and would exit every position.
func (q *LiveQuote) resolvedThresholds() (low, high float64) {
	if q == nil {
		return ibs.DefaultLowIBS, ibs.DefaultHighIBS
	}
	return ibs.Pair(q.Thresholds.LowIBS, q.Thresholds.HighIBS)
}
