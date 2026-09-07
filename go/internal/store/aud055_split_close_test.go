package store

import "testing"

// AUD-055: частичный выход копирует сделку в закрытую строку. Без is_test /
// is_hidden тестовая часть становилась боевой и попадала в реальную доходность.
func TestSplitCloseKeepsTestAndHiddenFlags(t *testing.T) {
	db := openTestDB(t)
	if err := db.InsertTrade("trades", map[string]any{
		"id": "t1", "symbol": "AAPL", "entryDate": "2024-01-02", "entryPrice": 100.0, "quantity": 10.0,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE trades SET is_test=1, is_hidden=1, entry_decision_time='15:59' WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}
	if err := db.SplitCloseTrade("trades", "t1", 4, 110, "2024-01-03", nil); err != nil {
		t.Fatal(err)
	}
	rows, err := db.SQL.Query(`SELECT status, quantity, is_test, is_hidden, entry_decision_time FROM trades`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var status, decision string
		var qty float64
		var isTest, isHidden int
		if err := rows.Scan(&status, &qty, &isTest, &isHidden, &decision); err != nil {
			t.Fatal(err)
		}
		n++
		if isTest != 1 || isHidden != 1 || decision != "15:59" {
			t.Fatalf("%s qty=%v is_test=%d is_hidden=%d decision=%q", status, qty, isTest, isHidden, decision)
		}
	}
	if n != 2 {
		t.Fatalf("want open + closed rows, got %d", n)
	}
}
