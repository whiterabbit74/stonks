package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/types"
)

// rawSplitBars: a 2-for-1 split on 2024-01-04. Without back-adjustment the
// pre-split half of the history sits at a different price level, so IBS and
// every trade derived from it are wrong.
func rawSplitBars() []types.OHLC {
	return []types.OHLC{
		{Date: "2024-01-02", Open: 200, High: 210, Low: 190, Close: 191, Volume: 1},
		{Date: "2024-01-03", Open: 200, High: 212, Low: 196, Close: 210, Volume: 1},
		{Date: "2024-01-04", Open: 100, High: 106, Low: 95, Close: 95.5, Volume: 1},
		{Date: "2024-01-05", Open: 100, High: 106, Low: 98, Close: 105, Volume: 1},
	}
}

func seedSplitDataset(t *testing.T, s *Server, ticker string, adjusted bool) {
	t.Helper()
	if err := s.DB.SaveDataset(ticker, ticker, "", "", rawSplitBars(), adjusted); err != nil {
		t.Fatalf("save dataset: %v", err)
	}
	if err := s.DB.ReplaceSplits(ticker, []types.SplitEvent{{Date: "2024-01-04", Factor: 2}}); err != nil {
		t.Fatalf("save splits: %v", err)
	}
}

func firstEntryPrice(t *testing.T, trades []types.Trade) float64 {
	t.Helper()
	if len(trades) == 0 {
		t.Fatal("expected at least one trade")
	}
	return trades[0].EntryPrice
}

// The split table lives on the server; the SPA sends only the ticker. A stored
// split on an unadjusted dataset must reach the backtest anyway.
func TestCalcAppliesStoredSplitsWithoutRequestSplits(t *testing.T) {
	s := testServer(t, "")
	seedSplitDataset(t, s, "SPLT", false)

	rec := postCalc(t, s, "single-position", map[string]any{
		"tickers":  []map[string]any{{"ticker": "SPLT"}},
		"strategy": map[string]any{"type": "ibs-mean-reversion"},
	})
	// 2024-01-02 has the lowest IBS; back-adjusted its close is 191/2.
	if got := firstEntryPrice(t, tradeSlice(t, rec)); got != 95.5 {
		t.Fatalf("entry price %v: stored split not applied (raw close is 191)", got)
	}
}

func TestCalcCleanAppliesStoredSplits(t *testing.T) {
	s := testServer(t, "")
	seedSplitDataset(t, s, "SPLT", false)

	rec := postCalc(t, s, "clean-backtest", map[string]any{
		"ticker":   "SPLT",
		"strategy": map[string]any{"type": "ibs-mean-reversion"},
	})
	if got := firstEntryPrice(t, tradeSlice(t, rec)); got != 95.5 {
		t.Fatalf("entry price %v: stored split not applied to clean backtest", got)
	}
}

func TestCalcBuyHoldAppliesStoredSplits(t *testing.T) {
	s := testServer(t, "")
	seedSplitDataset(t, s, "SPLT", false)

	rec := postCalc(t, s, "buy-hold", map[string]any{"ticker": "SPLT"})
	if got := firstEntryPrice(t, tradeSlice(t, rec)); got != 95.5 {
		t.Fatalf("entry price %v: stored split not applied to buy&hold", got)
	}
}

// An already back-adjusted dataset must not be adjusted a second time.
func TestCalcSkipsSplitsOnAdjustedDataset(t *testing.T) {
	s := testServer(t, "")
	seedSplitDataset(t, s, "ADJ", true)

	rec := postCalc(t, s, "single-position", map[string]any{
		"tickers":  []map[string]any{{"ticker": "ADJ"}},
		"strategy": map[string]any{"type": "ibs-mean-reversion"},
	})
	if got := firstEntryPrice(t, tradeSlice(t, rec)); got != 191 {
		t.Fatalf("entry price %v: adjusted dataset was adjusted twice", got)
	}
}

// flatBars never dip below the entry threshold: IBS is 1 on every bar, so this
// ticker contributes no trade of its own.
func flatBars() []types.OHLC {
	out := make([]types.OHLC, 0, 4)
	for _, d := range []string{"2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"} {
		out = append(out, types.OHLC{Date: d, Open: 100, High: 110, Low: 90, Close: 110, Volume: 1})
	}
	return out
}

// Splits sent in the request body belong to the symbol named by `ticker`.
// Spreading them over every ticker of a multi-ticker run back-adjusts prices
// that never split.
func TestCalcDoesNotApplyOneTickersSplitsToAnother(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveDataset("AAA", "AAA", "", "", flatBars(), false); err != nil {
		t.Fatalf("save AAA: %v", err)
	}
	if err := s.DB.SaveDataset("BBB", "BBB", "", "", rawSplitBars(), false); err != nil {
		t.Fatalf("save BBB: %v", err)
	}

	rec := postCalc(t, s, "single-position", map[string]any{
		"ticker":   "AAA",
		"tickers":  []map[string]any{{"ticker": "AAA"}, {"ticker": "BBB"}},
		"splits":   []map[string]any{{"date": "2024-01-04", "factor": 2}},
		"strategy": map[string]any{"type": "ibs-mean-reversion"},
	})
	// BBB has no split of its own, so its raw close stands.
	if got := firstEntryPrice(t, tradeSlice(t, rec)); got != 191 {
		t.Fatalf("entry price %v: AAA's split was applied to BBB", got)
	}
}

// Splits with no symbol to attach them to are rejected, not silently dropped.
func TestCalcRejectsSplitsWithoutTickerOnMultiTickerRun(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveDataset("BBB", "BBB", "", "", rawSplitBars(), false); err != nil {
		t.Fatalf("save BBB: %v", err)
	}

	body, err := json.Marshal(map[string]any{
		"tickers":  []map[string]any{{"ticker": "BBB"}},
		"splits":   []map[string]any{{"date": "2024-01-04", "factor": 2}},
		"strategy": map[string]any{"type": "ibs-mean-reversion"},
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/calc/single-position", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("status %d, want 400: ambiguous splits accepted", rec.Code)
	}
}
