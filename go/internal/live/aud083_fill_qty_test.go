package live

import "testing"

// AUD-083: Robinhood reports the executed quantity as cumulative_quantity. When
// fillQtyFrom missed it a partial fill read as 0 and the callers substituted the
// ordered quantity, booking more than the broker executed.
func TestFillQtyFromCumulativeQuantity(t *testing.T) {
	if got := fillQtyFrom(map[string]any{"cumulative_quantity": "4.000000", "quantity": "10.000000"}); got != 4 {
		t.Fatalf("cumulative_quantity: got %v, want 4", got)
	}
	if got := fillQtyFrom(map[string]any{"filled_qty": "3", "cumulative_quantity": "4"}); got != 3 {
		t.Fatalf("filled_qty must still win: got %v", got)
	}
}
