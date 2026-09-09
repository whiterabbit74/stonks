package store

import "testing"

func pf(v float64) *float64 { return &v }

func TestSavePositionRoundTrip(t *testing.T) {
	db := openTestDB(t)
	want := Position{
		ID: "p1", Symbol: "AAPL", Status: "open",
		EntryDate: "2026-09-01", EntryPrice: pf(311.05), EntryIBS: pf(0.04),
		EntryDecisionTime: "15:59", Quantity: 3,
		Source:    "telegram_t1_entry",
		Webull:    BrokerLeg{Qty: 2, EntryPrice: pf(311.0), EntryOrderID: "w-1"},
		Robinhood: BrokerLeg{Qty: 1, EntryPrice: pf(311.2), EntryOrderID: "r-1"},
	}
	if err := db.SavePosition(want); err != nil {
		t.Fatal(err)
	}
	got, err := db.GetPosition("p1")
	if err != nil || got == nil {
		t.Fatalf("get: %v %v", got, err)
	}
	if got.Symbol != "AAPL" || got.Status != "open" || got.Quantity != 3 {
		t.Fatalf("journal fields lost: %+v", got)
	}
	if *got.EntryIBS != 0.04 || *got.EntryPrice != 311.05 {
		t.Fatalf("signal lost: %+v", got)
	}
	if got.Webull.Qty != 2 || got.Robinhood.Qty != 1 {
		t.Fatalf("legs lost: %+v / %+v", got.Webull, got.Robinhood)
	}
	if got.ExecutedQty() != 3 {
		t.Fatalf("executed qty %v", got.ExecutedQty())
	}
	// A price that was never recorded stays NULL, not 0: a 0 fill price is a
	// claim about money that nobody made.
	if got.Webull.ExitPrice != nil {
		t.Fatalf("missing exit price became %v", *got.Webull.ExitPrice)
	}
}

func TestSavePositionUpdatesInPlace(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{ID: "p1", Symbol: "V", Status: "open", Quantity: 2}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(Position{ID: "p1", Symbol: "V", Status: "closed", Quantity: 2,
		ExitDate: "2026-09-02", ExitPrice: pf(378.93)}); err != nil {
		t.Fatal(err)
	}
	all, err := db.ListPositions()
	if err != nil || len(all) != 1 {
		t.Fatalf("want one row, got %d (%v)", len(all), err)
	}
	if all[0].Status != "closed" || *all[0].ExitPrice != 378.93 {
		t.Fatalf("update lost: %+v", all[0])
	}
}

func TestOpenPositionBySymbol(t *testing.T) {
	db := openTestDB(t)
	_ = db.SavePosition(Position{ID: "old", Symbol: "MSFT", Status: "closed", EntryDate: "2026-08-01"})
	_ = db.SavePosition(Position{ID: "now", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-01"})
	_ = db.SavePosition(Position{ID: "other", Symbol: "AAPL", Status: "open", EntryDate: "2026-09-01"})
	got, err := db.OpenPositionBySymbol("msft")
	if err != nil || got == nil {
		t.Fatalf("open by symbol: %v %v", got, err)
	}
	if got.ID != "now" {
		t.Fatalf("got %q", got.ID)
	}
	missing, err := db.OpenPositionBySymbol("TSLA")
	if err != nil || missing != nil {
		t.Fatalf("absent ticker must be nil, got %v %v", missing, err)
	}
}

// TestMergeLegacyJournals covers the three matching rules and the two shapes
// that used to be reported as a discrepancy: a journal row with no execution,
// and an execution with no journal row.
func TestMergeLegacyJournals(t *testing.T) {
	db := openTestDB(t)
	legacy := [][]any{
		// linked by linked_broker_trade_id
		{"trades", "j-linked", "V", "closed", "2026-09-01", "b-1"},
		// linked by the "m-" prefix convention
		{"trades", "m-b-2", "AAPL", "closed", "2026-08-03", ""},
		// linked by ticker + entry date
		{"trades", "j-dated", "MSFT", "closed", "2026-07-07", ""},
		// journal only: the signal was taken, no broker executed it
		{"trades", "j-alone", "AMZN", "closed", "2026-07-27", ""},
	}
	for _, r := range legacy {
		if _, err := db.SQL.Exec(`INSERT INTO trades (id, symbol, status, entry_date, linked_broker_trade_id, quantity, entry_price)
			VALUES (?,?,?,?,?,2,100)`, r[1], r[2], r[3], r[4], r[5]); err != nil {
			t.Fatal(err)
		}
	}
	for _, r := range [][]any{
		{"b-1", "V", "closed", "2026-09-01", "webull"},
		{"b-2", "AAPL", "closed", "2026-08-03", "webull"},
		{"b-3", "MSFT", "closed", "2026-07-07", "robinhood"},
		// execution with no journal row of its own
		{"b-orphan", "TSLA", "closed", "2026-06-01", "webull"},
	} {
		if _, err := db.SQL.Exec(`INSERT INTO broker_trades (id, symbol, status, entry_date, broker, quantity, entry_price)
			VALUES (?,?,?,?,?,2,101)`, r[0], r[1], r[2], r[3], r[4]); err != nil {
			t.Fatal(err)
		}
	}

	if err := mergeLegacyJournals(db.SQL); err != nil {
		t.Fatal(err)
	}
	all, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 5 {
		t.Fatalf("want 4 journal rows + 1 orphan execution = 5, got %d", len(all))
	}
	byID := map[string]Position{}
	for _, p := range all {
		byID[p.ID] = p
	}
	for _, id := range []string{"j-linked", "m-b-2", "j-dated"} {
		p, ok := byID[id]
		if !ok {
			t.Fatalf("missing %s", id)
		}
		if !p.Webull.Executed() && !p.Robinhood.Executed() {
			t.Fatalf("%s lost its execution: %+v", id, p)
		}
	}
	if byID["j-dated"].Robinhood.Qty != 2 {
		t.Fatalf("broker column must pick the leg: %+v", byID["j-dated"])
	}
	if byID["j-alone"].Webull.Executed() || byID["j-alone"].Robinhood.Executed() {
		t.Fatalf("journal-only row must have empty legs: %+v", byID["j-alone"])
	}
	if byID["b-orphan"].Symbol != "TSLA" || !byID["b-orphan"].Webull.Executed() {
		t.Fatalf("orphan execution dropped: %+v", byID["b-orphan"])
	}
}

// TestMergeLegacyJournalsRunsOnce guards the schema-version gate: a second pass
// over already-merged data must not duplicate rows.
func TestMergeLegacyJournalsRunsOnce(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.SQL.Exec(`INSERT INTO trades (id, symbol, status, entry_date, quantity) VALUES ('j','V','open','2026-09-01',1)`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := mergeLegacyJournals(db.SQL); err != nil {
			t.Fatal(err)
		}
	}
	all, _ := db.ListPositions()
	if len(all) != 1 {
		t.Fatalf("merge is not idempotent: %d rows", len(all))
	}
}
