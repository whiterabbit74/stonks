package store

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-185: DateKey only cuts the string, so a provider's 2024-02-30 bar was
// stored as a trading date.
func TestMergeOHLCRejectsImpossibleDate(t *testing.T) {
	d := openTestDB(t)
	bar := func(date string) []types.OHLC {
		return []types.OHLC{{Date: date, Open: 10, High: 11, Low: 9, Close: 10, Volume: 1}}
	}
	if err := d.MergeOHLC("AAA", bar("2024-02-30")); err == nil {
		t.Fatal("an impossible date must be refused")
	}
	if err := d.MergeOHLC("AAA", bar("2024-02-29")); err != nil {
		t.Fatalf("a real leap day must merge: %v", err)
	}
}
