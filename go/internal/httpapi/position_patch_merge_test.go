package httpapi

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// The edit forms send only the fields they show. What they omit must survive the
// patch: the ticker, the status of a closed row, and the broker legs with their
// order ids.
func TestPatchPositionKeepsOmittedFields(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{
		ID: "m1", Symbol: "AAPL", Status: "closed",
		EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10),
		ExitDate: "2026-09-01", ExitPrice: store.Ptr[float64](12),
		EntryDecisionTime: "15:59:00", Source: "auto", Quantity: 3,
		Webull: store.BrokerLeg{Qty: 3, EntryPrice: store.Ptr[float64](10.1), EntryOrderID: "w-1"},
	}); err != nil {
		t.Fatal(err)
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"notes": "правка"}); rec.Code != 200 {
		t.Fatalf("patch %d %s", rec.Code, rec.Body.String())
	}
	p, err := s.DB.GetPosition("m1")
	if err != nil || p == nil {
		t.Fatalf("get %v %v", p, err)
	}
	if p.Symbol != "AAPL" {
		t.Fatalf("ticker lost: %q", p.Symbol)
	}
	if p.Status != "closed" {
		t.Fatalf("closed position reopened: %q", p.Status)
	}
	if p.Webull.Qty != 3 || p.Webull.EntryOrderID != "w-1" {
		t.Fatalf("leg lost: %+v", p.Webull)
	}
	if p.EntryDecisionTime != "15:59:00" || p.Source != "auto" || p.EntryDate != "2026-08-20" {
		t.Fatalf("signal lost: %+v", p)
	}
	if p.Notes != "правка" {
		t.Fatalf("notes not applied: %q", p.Notes)
	}
}

// Editing the prices by hand recomputes the P&L instead of leaving the old
// number beside the new prices.
func TestPatchPositionRecomputesPnL(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{
		ID: "m1", Symbol: "AAPL", Status: "closed", Quantity: 2,
		EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10),
		ExitDate: "2026-09-01", ExitPrice: store.Ptr[float64](12),
	}); err != nil {
		t.Fatal(err)
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"exitPrice": 11.0}); rec.Code != 200 {
		t.Fatalf("patch %d %s", rec.Code, rec.Body.String())
	}
	p, _ := s.DB.GetPosition("m1")
	if p == nil || p.PnLAbsolute == nil || *p.PnLAbsolute != 2 {
		t.Fatalf("pnlAbsolute %v", p.PnLAbsolute)
	}
	if p.PnLPercent == nil || *p.PnLPercent != 10 {
		t.Fatalf("pnlPercent %v", p.PnLPercent)
	}
}

// The ticker is the identity of the row: an edit that clears it is refused, so
// a position cannot end up nameless and invisible to the reconciliation.
func TestPatchPositionRejectsEmptyTicker(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{ID: "m1", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-04"}); err != nil {
		t.Fatal(err)
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"symbol": " "}); rec.Code != 400 {
		t.Fatalf("want 400, got %d %s", rec.Code, rec.Body.String())
	}
	p, _ := s.DB.GetPosition("m1")
	if p == nil || p.Symbol != "MSFT" {
		t.Fatalf("ticker changed: %+v", p)
	}
}

// Zero is not a price (AUD-129): a blank field sent as 0 must be refused, not
// stored over NULL where it blocks the PnL forever. null keeps the NULL.
func TestPatchPositionRejectsZeroPrice(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{ID: "m1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20"}); err != nil {
		t.Fatal(err)
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"entryPrice": 0}); rec.Code != 400 {
		t.Fatalf("zero entry price: %d %s", rec.Code, rec.Body.String())
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"entryPrice": nil, "notes": "x"}); rec.Code != 200 {
		t.Fatalf("null entry price: %d %s", rec.Code, rec.Body.String())
	}
	if p, _ := s.DB.GetPosition("m1"); p == nil || p.EntryPrice != nil || p.Notes != "x" {
		t.Fatalf("got %+v", p)
	}
	if rec := postJSON(s, "/api/positions", map[string]any{"symbol": "MSFT", "entryPrice": 0}); rec.Code != 400 {
		t.Fatalf("post zero entry price: %d %s", rec.Code, rec.Body.String())
	}
}

// AUD-131: an impossible or non-ISO date is refused on create, edit and close.
func TestPositionRejectsInvalidDate(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{ID: "m1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20"}); err != nil {
		t.Fatal(err)
	}
	if rec := patchJSON(s, "/api/positions/m1", map[string]any{"entryDate": "2024-02-30"}); rec.Code != 400 {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	if rec := postJSON(s, "/api/positions", map[string]any{"symbol": "MSFT", "entryDate": "02.10.2026"}); rec.Code != 400 {
		t.Fatalf("post: %d %s", rec.Code, rec.Body.String())
	}
	if rec := postJSON(s, "/api/positions/m1/close", map[string]any{"exitPrice": 10.0, "exitDate": "02.10.2026"}); rec.Code != 400 {
		t.Fatalf("close: %d %s", rec.Code, rec.Body.String())
	}
	if p, _ := s.DB.GetPosition("m1"); p == nil || p.Status != "open" {
		t.Fatalf("got %+v", p)
	}
}
