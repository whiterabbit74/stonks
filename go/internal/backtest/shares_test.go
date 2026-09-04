package backtest

import "testing"

func TestWholeSharesNeverBuysAFraction(t *testing.T) {
	if wholeShares(62.5) != 62 {
		t.Fatalf("got %v want 62", wholeShares(62.5))
	}
	if wholeShares(0.9) != 0 {
		t.Fatalf("sub-share buy %v", wholeShares(0.9))
	}
	if wholeShares(1) != 1 {
		t.Fatalf("exact share %v", wholeShares(1))
	}
}
