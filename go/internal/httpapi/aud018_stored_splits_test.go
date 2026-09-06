package httpapi

import (
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
