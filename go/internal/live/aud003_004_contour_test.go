package live

import (
	"fmt"
	"sync"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-003 / AUD-004 (docs/audits/REGISTRY.md): one end-to-end scenario that
// walks a live order through the whole broker contour on BOTH brokers at once
// — submission, clientOrderId persistence, listing lag, an unrecognised
// status, a partial fill, a restart, and a manual close racing the automatic
// one — and asserts the journal never loses or swaps the broker and never
// duplicates a row.

func trackerFor(t *testing.T, e *Engine, id string) map[string]any {
	t.Helper()
	row := e.DB.GetOrderTracker(id)
	if row == nil {
		t.Fatalf("tracker %s missing", id)
	}
	return row
}

func brokerRows(t *testing.T, db *store.DB, id string) []store.Position {
	t.Helper()
	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var out []store.Position
	for _, r := range rows {
		if r.ID == id {
			out = append(out, r)
		}
	}
	return out
}

func TestAUD003BrokerContourEndToEnd(t *testing.T) {
	e, w, r := dualBrokerEngine(t, entryBars)
	// Both brokers report the order as still working until this scenario says
	// otherwise, so nothing finalizes behind the steps below.
	ev := e.Execute("t1")
	if !ev.Executed {
		t.Fatalf("entry not submitted: %+v", ev.Broker)
	}
	e.StopTrackers()

	if len(w.Orders) != 1 || len(r.Orders) != 1 {
		t.Fatalf("want one order per broker, got webull=%d robinhood=%d", len(w.Orders), len(r.Orders))
	}
	wID := w.Orders[0].ClientOrderID
	rID := r.Orders[0].ClientOrderID
	if wID == "" || rID == "" || wID == rID {
		t.Fatalf("clientOrderId not distinct/persisted: webull=%q robinhood=%q", wID, rID)
	}

	// (2) clientOrderId and broker are persisted on the tracker, per broker.
	for _, tc := range []struct{ id, broker string }{{wID, "webull"}, {rID, "robinhood"}} {
		row := trackerFor(t, e, tc.id)
		if got := legBroker(row); got != tc.broker {
			t.Fatalf("tracker %s broker=%q want %q", tc.id, got, tc.broker)
		}
		if got := fmt.Sprint(row["clientOrderId"]); got != tc.id {
			t.Fatalf("tracker clientOrderId=%q want %q", got, tc.id)
		}
	}

	// (3) Listing lag: Robinhood cannot list the order yet. The tracker must
	// stay pending — not finalize, not resend.
	r.ListingLag = true
	e.PollTrackers()
	if st := fmt.Sprint(trackerFor(t, e, rID)["status"]); IsFinalOrderStatus(st) {
		t.Fatalf("listing lag finalized the tracker: status=%s", st)
	}
	if len(r.Orders) != 1 {
		t.Fatalf("listing lag caused a resend: %d orders", len(r.Orders))
	}
	r.ListingLag = false

	// (4) Unknown status word with no executed quantity: still not final, and
	// no journal row invented.
	w.SetDetail(wID, map[string]any{"status": "SOME_NEW_STATE", "client_order_id": wID})
	e.PollTrackers()
	if st := fmt.Sprint(trackerFor(t, e, wID)["status"]); IsFinalOrderStatus(st) {
		t.Fatalf("unknown status finalized the tracker: status=%s", st)
	}
	if rows := brokerRows(t, e.DB, wID); len(rows) != 0 {
		t.Fatalf("unknown status created a journal row: %+v", rows)
	}

	ordered := asFloat(trackerFor(t, e, wID)["quantity"])
	if !(ordered > 1) {
		t.Fatalf("ordered quantity too small to split: %v", ordered)
	}

	// (5) Partial fill: a partially executed order is not done. The tracker
	// keeps polling and the journal stays empty until the fill is final.
	w.SetDetail(wID, map[string]any{
		"status": "PARTIAL_FILLED", "client_order_id": wID,
		"filled_qty": ordered - 1, "filled_price": 8.2,
	})
	e.PollTrackers()
	if st := fmt.Sprint(trackerFor(t, e, wID)["status"]); IsFinalOrderStatus(st) {
		t.Fatalf("partial fill finalized the tracker: status=%s", st)
	}

	// The remainder fills. Now the order is done, on Webull only.
	w.SetDetail(wID, map[string]any{
		"status": "FILLED", "client_order_id": wID,
		"filled_qty": ordered, "filled_price": 8.25,
	})
	e.PollTrackers()
	if st := fmt.Sprint(trackerFor(t, e, wID)["status"]); st != "filled" {
		t.Fatalf("full fill did not finalize: status=%s", st)
	}

	// (8)+(9) Exactly one journal row, carrying the broker that filled it.
	rows := brokerRows(t, e.DB, wID)
	if len(rows) != 1 {
		t.Fatalf("want exactly one journal row for %s, got %d: %+v", wID, len(rows), rows)
	}
	if got := legBroker(rows[0]); got != "webull" {
		t.Fatalf("journal row broker=%q want webull", got)
	}
	if got := rows[0].Quantity; got != ordered {
		t.Fatalf("journal quantity=%v want %v", got, ordered)
	}
	// Robinhood's own order is still open and must not have been journaled
	// under Webull's fill.
	if rr := brokerRows(t, e.DB, rID); len(rr) != 0 {
		t.Fatalf("robinhood order journaled by webull's fill: %+v", rr)
	}

	// (6) Restart: a fresh engine over the same database resumes the still
	// pending Robinhood tracker and must not duplicate the finished Webull one.
	e2 := New(e.DB, e.Quotes)
	e2.Telegram = &MemoryTelegram{}
	e2.ChatID = "c"
	e2.Now = e.Now
	e2.AttachBroker("webull", w)
	e2.AttachBroker("robinhood", r)
	r.SetDetail(rID, map[string]any{
		"status": "FILLED", "client_order_id": rID,
		"filled_qty": ordered, "filled_price": 8.3,
	})
	e2.ResumeTrackers()
	e2.StopTrackers()
	if st := fmt.Sprint(trackerFor(t, e2, rID)["status"]); st != "filled" {
		t.Fatalf("restart did not resolve the pending tracker: status=%s", st)
	}
	// Обе заявки на один тикер: одна позиция, две ноги. Восстановленный после
	// перезапуска трекер Robinhood дописывает свою ногу, а не заводит вторую
	// строку журнала.
	all, _ := e.DB.ListPositions()
	if len(all) != 1 {
		t.Fatalf("want exactly one position for both brokers, got %d: %+v", len(all), all)
	}
	if all[0].Robinhood.EntryOrderID != rID {
		t.Fatalf("restart did not journal the robinhood leg: %+v", all[0].Robinhood)
	}
	if all[0].Webull.EntryOrderID != wID {
		t.Fatalf("restart lost the webull leg: %+v", all[0].Webull)
	}

	// Re-polling after everything is final changes nothing.
	e2.PollTrackers()
	again, _ := e.DB.ListPositions()
	if len(again) != 1 {
		t.Fatalf("re-poll duplicated the position: %+v", again)
	}
	if again[0].Webull.EntryOrderID != wID || again[0].Robinhood.EntryOrderID != rID {
		t.Fatalf("re-poll disturbed the legs: %+v", again[0])
	}
}

// TestAUD004ManualAndAutoCloseConcurrent runs the operator's manual close and
// the scheduler's automatic exit at the same instant, on the same broker and
// symbol: exactly one SELL may reach the broker and exactly one exit tracker
// may exist.
func TestAUD004ManualAndAutoCloseConcurrent(t *testing.T) {
	for _, name := range []string{"webull", "robinhood"} {
		t.Run(name, func(t *testing.T) {
			e, w, r := dualBrokerEngine(t, exitBars)
			br := w
			if name == "robinhood" {
				br = r
			}
			// Only this broker holds the position, so only it can exit.
			holdAAPL(br, 3)
			journalAAPL(t, e, name+"-aapl", name, 3)
			// exitBars close 11.9 -> IBS 0.975 > highIBS, so the engine wants out.
			e.PatchAutoConfig(map[string]any{"highIBS": 0.75})

			var wg sync.WaitGroup
			wg.Add(2)
			start := make(chan struct{})
			go func() {
				defer wg.Done()
				<-start
				_, _ = e.ClosePosition(name, "AAPL")
			}()
			go func() {
				defer wg.Done()
				<-start
				_ = e.Execute("t1")
			}()
			close(start)
			wg.Wait()
			e.StopTrackers()

			sells := 0
			for _, o := range br.Orders {
				if o.Side == "SELL" && o.Symbol == "AAPL" {
					sells++
				}
			}
			if sells != 1 {
				t.Fatalf("%s: want exactly one SELL, got %d: %v", name, sells, sides(br.Orders))
			}
			pending, err := e.DB.ListPendingTrackers()
			if err != nil {
				t.Fatal(err)
			}
			exits := 0
			for _, p := range pending {
				if fmt.Sprint(p["action"]) == "exit" {
					exits++
					if got := legBroker(p); got != name {
						t.Fatalf("exit tracker broker=%q want %q", got, name)
					}
				}
			}
			if exits != 1 {
				t.Fatalf("%s: want exactly one exit tracker, got %d", name, exits)
			}
		})
	}
}
