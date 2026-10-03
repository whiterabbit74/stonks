package httpapi

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-139: an impossible session and a zero price used to pass.
func TestValidateBarsRejectsBadDateAndPrice(t *testing.T) {
	ok := types.OHLC{Date: "2024-02-29", Open: 1, High: 2, Low: 1, Close: 1.5}
	if r := validateBars([]types.OHLC{ok}); len(r) != 0 {
		t.Fatalf("good bar refused: %v", r)
	}
	for _, b := range []types.OHLC{
		{Date: "2024-02-30", Open: 1, High: 2, Low: 1, Close: 1.5},
		{Date: "2024-03-01", Open: 0, High: 1, Low: 0, Close: 0},
	} {
		if r := validateBars([]types.OHLC{ok, b}); len(r) == 0 {
			t.Fatalf("bad bar accepted: %+v", b)
		}
	}
}
