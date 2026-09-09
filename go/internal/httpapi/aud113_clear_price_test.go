package httpapi

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-113: PATCH, стирающий цену, оставлял прежнюю посчитанную прибыль — число
// без данных, из которых оно получено.
func TestPatchClearingPriceClearsPnL(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{
		ID: "p", Symbol: "AAPL", Status: "closed", Quantity: 10,
		EntryDate: "2026-08-20", ExitDate: "2026-08-25",
		EntryPrice: store.Ptr(10.0), ExitPrice: store.Ptr(12.0),
	}); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.DB.GetPosition("p"); p.PnLAbsolute == nil || *p.PnLAbsolute != 20 {
		t.Fatalf("подготовка: ожидался PnL 20, получено %v", p.PnLAbsolute)
	}

	if rec := patchJSON(s, "/api/positions/p", map[string]any{"entryPrice": nil}); rec.Code != 200 {
		t.Fatalf("PATCH %d %s", rec.Code, rec.Body.String())
	}
	p, err := s.DB.GetPosition("p")
	if err != nil {
		t.Fatal(err)
	}
	if p.EntryPrice != nil {
		t.Fatalf("цена входа должна очиститься: %v", *p.EntryPrice)
	}
	if p.PnLAbsolute != nil || p.PnLPercent != nil {
		t.Fatalf("PnL без цены входа должен быть NULL: abs=%v pct=%v", p.PnLAbsolute, p.PnLPercent)
	}
}
