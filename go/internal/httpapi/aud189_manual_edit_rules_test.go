package httpapi

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-189: PATCH and POST wrote the row as given. {"status":"closed"} closed a
// held position past /close with its legs still holding and no exit; any other
// status word dropped the row out of every "status='open'" look-up; an exit
// before the entry went through; the legs could be rewritten by hand.
func TestManualPositionEditKeepsJournalRules(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{
		ID: "p", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", Quantity: 2,
		Webull: store.BrokerLeg{Qty: 2, EntryOrderID: "w-1"},
	}); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]map[string]any{
		"close by status":   {"status": "closed"},
		"unknown status":    {"status": "archived"},
		"exit before entry": {"exitDate": "2026-08-01"},
		"leg rewritten":     {"webull": map[string]any{"qty": 0, "entryOrderId": "w-1"}},
	} {
		if rec := patchJSON(s, "/api/positions/p", body); rec.Code != 400 {
			t.Errorf("PATCH %s: %d %s, want 400", name, rec.Code, rec.Body.String())
		}
	}
	if p, _ := s.DB.GetPosition("p"); p == nil || p.Status != "open" || p.ExitDate != "" || p.Webull.Qty != 2 {
		t.Fatalf("row changed by a refused edit: %+v", p)
	}
	if rec := patchJSON(s, "/api/positions/p", map[string]any{"notes": "ok"}); rec.Code != 200 {
		t.Fatalf("plain edit refused: %d %s", rec.Code, rec.Body.String())
	}

	for name, body := range map[string]map[string]any{
		"unknown status":      {"symbol": "MSFT", "status": "archived"},
		"exit before entry":   {"symbol": "MSFT", "entryDate": "2026-08-20", "exitDate": "2026-08-01", "exitPrice": 5.0, "status": "closed", "isTest": true},
		"closed without exit": {"symbol": "MSFT", "entryDate": "2026-08-20", "status": "closed", "isTest": true},
		"legs typed by hand":  {"symbol": "MSFT", "entryDate": "2026-08-20", "isTest": true, "webull": map[string]any{"qty": 3}},
		"overwrite by id":     {"id": "p", "symbol": "AAPL", "status": "closed", "exitDate": "2026-08-21", "exitPrice": 5.0},
	} {
		if rec := postJSON(s, "/api/positions", body); rec.Code != 400 && name != "overwrite by id" {
			t.Errorf("POST %s: %d %s, want 400", name, rec.Code, rec.Body.String())
		}
	}
	if p, _ := s.DB.GetPosition("p"); p == nil || p.Status != "open" || p.Webull.Qty != 2 {
		t.Fatalf("POST overwrote an existing row: %+v", p)
	}
}
