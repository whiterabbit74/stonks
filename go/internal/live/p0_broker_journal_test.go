package live

import (
	"mktorder.com/go/internal/store"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestEvaluateWindowQuotesEveryBrokerOpenSymbol(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	mq, ok := e.Quotes.(*MemoryQuotes)
	if !ok {
		t.Fatal("want MemoryQuotes")
	}
	msft := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	mq.Bars["MSFT"] = msft
	if err := e.DB.SaveDataset("MSFT", "MSFT", "", "", msft, false); err != nil {
		t.Fatal(err)
	}
	if err := e.DB.SavePosition(store.Position{ID: "rh-msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0), Quantity: 1.0, Robinhood: store.BrokerLeg{Qty: 1.0, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 1.0}}
	webull.Pos = nil
	ev := e.EvaluateWindow(backgroundWindow())
	for _, q := range ev.Quotes {
		if q.Symbol == "MSFT" {
			return
		}
	}
	t.Fatalf("quotes missing RH-only open MSFT: %+v", ev.Quotes)
}

func dualBrokerEngine(t *testing.T, bars []types.OHLC) (*Engine, *MemoryBroker, *MemoryBroker) {
	t.Helper()
	_, e, webull := testEngine(t, bars)
	webull.Name = "webull"
	rh := &MemoryBroker{Name: "robinhood"}
	e.AttachBroker("webull", webull)
	e.AttachBroker("robinhood", rh)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1,
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e, webull, rh
}

func holdAAPL(br *MemoryBroker, qty float64) {
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": qty, "market_value": qty * 10}}
}

func journalAAPL(t *testing.T, e *Engine, id, broker string, qty float64) {
	t.Helper()
	p := store.Position{ID: id, Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0), Quantity: qty}
	p.SetLeg(broker, store.BrokerLeg{Qty: qty, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: id})
	if err := e.DB.SavePosition(p); err != nil {
		t.Fatal(err)
	}
}

func sides(orders []OrderResult) []string {
	var out []string
	for _, o := range orders {
		out = append(out, o.Side+":"+o.Symbol)
	}
	return out
}

var entryBars = []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
var exitBars = []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}

func TestPerBrokerEntryMatrix(t *testing.T) {
	cases := []struct {
		name       string
		webullHeld bool
		rhHeld     bool
		wantW      int
		wantR      int
	}{
		{"both_flat", false, false, 1, 1},
		{"webull_held_rh_flat", true, false, 0, 1},
		{"webull_flat_rh_held", false, true, 1, 0},
		{"both_held", true, true, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, w, r := dualBrokerEngine(t, entryBars)
			if tc.webullHeld {
				holdAAPL(w, 2)
			}
			if tc.rhHeld {
				holdAAPL(r, 2)
			}
			_ = e.Execute("t1")
			if len(w.Orders) != tc.wantW {
				t.Fatalf("webull orders=%v want %d", sides(w.Orders), tc.wantW)
			}
			if len(r.Orders) != tc.wantR {
				t.Fatalf("robinhood orders=%v want %d", sides(r.Orders), tc.wantR)
			}
			for _, o := range append(append([]OrderResult{}, w.Orders...), r.Orders...) {
				if o.Side != "BUY" || o.Symbol != "AAPL" {
					t.Fatalf("unexpected %+v", o)
				}
			}
		})
	}
}

func TestPerBrokerExitMatrix(t *testing.T) {
	cases := []struct {
		name     string
		webullOn bool
		rhOn     bool
		wantW    int
		wantR    int
	}{
		{"webull_held_rh_flat", true, false, 1, 0},
		{"webull_flat_rh_held", false, true, 0, 1},
		{"both_held", true, true, 1, 1},
		{"both_flat", false, false, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, w, r := dualBrokerEngine(t, exitBars)
			if tc.webullOn {
				holdAAPL(w, 2)
				journalAAPL(t, e, "w-aapl", "webull", 2)
			}
			if tc.rhOn {
				holdAAPL(r, 3)
				journalAAPL(t, e, "r-aapl", "robinhood", 3)
			}
			_ = e.Execute("t1")
			if len(w.Orders) != tc.wantW {
				t.Fatalf("webull orders=%v want %d", sides(w.Orders), tc.wantW)
			}
			if len(r.Orders) != tc.wantR {
				t.Fatalf("robinhood orders=%v want %d", sides(r.Orders), tc.wantR)
			}
			for _, o := range append(append([]OrderResult{}, w.Orders...), r.Orders...) {
				if o.Side != "SELL" || o.Symbol != "AAPL" {
					t.Fatalf("unexpected %+v", o)
				}
			}
		})
	}
}

// Одна позиция, две ноги: выход Robinhood закрывает свою ногу и не трогает
// ногу Webull, а сама позиция остаётся открытой, пока Webull держит акции.
func TestRobinhoodFillDoesNotCloseWebullLeg(t *testing.T) {
	e, _, _ := dualBrokerEngine(t, exitBars)
	if err := e.DB.SavePosition(store.Position{
		ID: "aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01",
		EntryPrice: store.Ptr[float64](10.0), Quantity: 5,
		Webull:    store.BrokerLeg{Qty: 2, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: "w-open"},
		Robinhood: store.BrokerLeg{Qty: 3, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: "r-open"},
	}); err != nil {
		t.Fatal(err)
	}
	e.mu.Lock()
	if e.orderMeta == nil {
		e.orderMeta = map[string]orderMeta{}
	}
	e.orderMeta["rh-sell"] = orderMeta{
		Action: "exit", Symbol: "AAPL", Quantity: 3, Broker: "robinhood",
		QuotePrice: 11.9, DateKey: "2026-09-01",
	}
	e.mu.Unlock()
	e.recordFill(map[string]any{
		"clientOrderId": "rh-sell", "symbol": "AAPL", "action": "exit",
		"source": "t1", "dateKey": "2026-09-01", "quantity": 3.0,
	}, map[string]any{"status": "filled", "avg_price": 11.9, "filled_qty": 3.0}, "filled")
	p, _ := e.DB.GetPosition("aapl")
	if p == nil || p.Status != "open" {
		t.Fatalf("position must stay open while webull holds it: %+v", p)
	}
	if p.Webull.Qty != 2 {
		t.Fatalf("webull leg touched: %+v", p.Webull)
	}
	if p.Robinhood.Qty != 0 || p.Robinhood.ExitOrderID != "rh-sell" {
		t.Fatalf("robinhood leg not closed: %+v", p.Robinhood)
	}
}
