package live

import "testing"

func TestFillQtyFromIgnoresOrderedQty(t *testing.T) {
	if q := fillQtyFrom(map[string]any{"qty": 10, "quantity": 10}); q != 0 {
		t.Fatalf("ordered qty must not count as filled, got %v", q)
	}
	if q := fillQtyFrom(map[string]any{"filled_qty": 3, "qty": 10}); q != 3 {
		t.Fatalf("filled_qty=%v want 3", q)
	}
}
