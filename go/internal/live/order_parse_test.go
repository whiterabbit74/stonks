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

func TestOrderStatusFieldIgnoresSceneType(t *testing.T) {
	if s := orderStatusField(map[string]any{"scene_type": "NORMAL"}); s != "" {
		t.Fatalf("scene_type is not an order status, got %q", s)
	}
	if s := orderStatusField(map[string]any{"status": "filled", "scene_type": "NORMAL"}); s != "filled" {
		t.Fatalf("got %q", s)
	}
}

