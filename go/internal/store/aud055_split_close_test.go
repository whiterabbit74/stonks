package store

import "testing"

// AUD-055: частичный выход копирует позицию в закрытую строку. Без is_test /
// is_hidden тестовая часть становилась боевой и попадала в реальную доходность.
func TestSplitPositionKeepsTestAndHiddenFlags(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{
		ID: "t1", Symbol: "AAPL", Status: "open", EntryDate: "2024-01-02",
		EntryPrice: Ptr[float64](100.0), Quantity: 10.0, EntryDecisionTime: "15:59",
		IsTest: true, IsHidden: true,
		Webull: BrokerLeg{Qty: 10, EntryPrice: Ptr[float64](100.0)},
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.SplitPosition("t1", "webull", 4, 110, "2024-01-03", "partial_exit"); err != nil {
		t.Fatal(err)
	}
	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("want open + closed rows, got %d", len(rows))
	}
	for _, p := range rows {
		if !p.IsTest || !p.IsHidden || p.EntryDecisionTime != "15:59" {
			t.Fatalf("%s qty=%v is_test=%v is_hidden=%v decision=%q", p.Status, p.Quantity, p.IsTest, p.IsHidden, p.EntryDecisionTime)
		}
	}
}

// The sold shares leave the open leg and land on the closed part, so the two
// rows still add up to what the broker holds.
func TestSplitPositionMovesTheSoldSharesOffTheOpenLeg(t *testing.T) {
	db := openTestDB(t)
	_ = db.SavePosition(Position{ID: "p1", Symbol: "AAPL", Status: "open", EntryDate: "2024-01-02",
		EntryPrice: Ptr[float64](100.0), Quantity: 10,
		Webull: BrokerLeg{Qty: 10, EntryPrice: Ptr[float64](100.0)}})
	if err := db.SplitPosition("p1", "webull", 4, 110, "2024-01-03", "partial_exit"); err != nil {
		t.Fatal(err)
	}
	rows, _ := db.ListPositions()
	var open, closed *Position
	for i := range rows {
		if rows[i].Status == "open" {
			open = &rows[i]
		} else {
			closed = &rows[i]
		}
	}
	if open == nil || open.Quantity != 6 || open.Webull.Qty != 6 {
		t.Fatalf("open remainder %+v", open)
	}
	if closed == nil || closed.Quantity != 4 || closed.Webull.Qty != 4 {
		t.Fatalf("closed part %+v", closed)
	}
	// AUD-044: реализованный PnL по проданным акциям остаётся в журнале.
	if closed.PnLAbsolute == nil || *closed.PnLAbsolute != 40 {
		t.Fatalf("realised pnl %v, want 40", closed.PnLAbsolute)
	}
}
