package live

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"testing"

	"mktorder.com/go/internal/store"
)

// The monitoring's decision is a plain function of the readings, the watch
// list and its own ticker (CORE §3.1). monitor_decision.go must not be able to
// reach an Engine, a broker, its book or the autotrade config — not even a
// journal row, which carries the brokers' legs.
func TestMonitorDecisionFileHasNoBrokerAccess(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "monitor_decision.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	forbidden := map[string]bool{
		"Engine": true, "Broker": true, "Brokers": true, "BrokerFlags": true,
		"BrokerPosition": true, "BrokerOrder": true, "brokerBook": true,
		"TradingConfig": true, "EvalResult": true, "Position": true, "DB": true,
	}
	ast.Inspect(f, func(n ast.Node) bool {
		switch n := n.(type) {
		case *ast.Ident:
			if forbidden[n.Name] {
				t.Errorf("monitor_decision.go uses %s: the monitoring's decision must not see brokers or autotrade", n.Name)
			}
		case *ast.FuncDecl:
			if n.Recv != nil {
				if star, ok := n.Recv.List[0].Type.(*ast.StarExpr); !ok || fmt.Sprint(star.X) != "LiveQuote" {
					t.Errorf("monitor_decision.go: %s is a method; only *LiveQuote readings may have methods here", n.Name.Name)
				}
			}
		}
		return true
	})
}

// Same readings, same watch list, same monitoring position → same decision,
// whatever the brokers hold, whatever state they are in and whatever autotrade
// is set to. Evaluating asks no broker for its book.
func TestMonitorDecisionIgnoresBrokerState(t *testing.T) {
	brokerStates := []struct {
		name string
		set  func(e *Engine, wb, rh *MemoryBroker)
	}{
		{"autotrade on", func(*Engine, *MemoryBroker, *MemoryBroker) {}},
		{"autotrade off", func(e *Engine, _, _ *MemoryBroker) {
			e.PatchAutoConfig(map[string]any{"enabled": false})
		}},
		{"broker flags off", func(e *Engine, _, _ *MemoryBroker) {
			e.PatchAutoConfig(map[string]any{"brokers": map[string]any{
				"webull":    map[string]any{"enabled": false, "allowNewEntries": false, "allowExits": false},
				"robinhood": map[string]any{"enabled": false, "allowNewEntries": false, "allowExits": false},
			}})
		}},
		{"leftovers at both brokers", func(_ *Engine, wb, rh *MemoryBroker) {
			wb.SetPos([]any{map[string]any{"symbol": "TQQQ", "quantity": 10.0}, map[string]any{"symbol": "MSFT", "quantity": 4.0}})
			rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
		}},
		{"books unreadable", func(_ *Engine, wb, rh *MemoryBroker) {
			wb.FailPositions = errors.New("positions down")
			rh.FailPositions = errors.New("positions down")
		}},
		{"brokers unhealthy", func(e *Engine, _, _ *MemoryBroker) {
			_ = e.DB.SaveWebullToken("tok", "2099-01-01", HealthNeedsReauth)
			_ = e.DB.UpsertRobinhoodHealth("2026-09-01", HealthNeedsReauth, "now")
		}},
		{"no broker attached", func(e *Engine, _, _ *MemoryBroker) {
			e.Broker, e.Brokers = nil, nil
		}},
	}
	monitorStates := []struct {
		name string
		held string // the monitoring's position, "" = flat
		want string
	}{
		{"flat", "", "entry lowest_ibs_signal MSFT ibs=0.025"},
		{"holding AAPL", "AAPL", "exit ibs_exit AAPL ibs=0.975"},
		{"holding MSFT", "MSFT", "none exit_threshold_not_reached MSFT ibs=0.025"},
	}
	for _, ms := range monitorStates {
		for _, bs := range brokerStates {
			t.Run(ms.name+"/"+bs.name, func(t *testing.T) {
				e, wb, rh := layersEngine(t, true)
				if ms.held != "" {
					if _, err := e.DB.OpenMonitorPosition(store.Position{ID: "m1", Symbol: ms.held, EntryDate: "2026-08-31", EntryPrice: store.Ptr(10.0)}); err != nil {
						t.Fatal(err)
					}
				}
				bs.set(e, wb, rh)
				dec := e.EvaluateWindow(backgroundWindow()).Decision
				got := fmt.Sprintf("%v %v %v ibs=%.3f", dec["action"], dec["reason"], dec["symbol"], candidateIBS(dec))
				if got != ms.want {
					t.Fatalf("decision %q, want %q", got, ms.want)
				}
				if wb.PosCalls+rh.PosCalls != 0 || len(wb.Orders)+len(rh.Orders) != 0 {
					t.Fatalf("evaluating asks no broker: reads %d %d, orders %v %v", wb.PosCalls, rh.PosCalls, wb.Orders, rh.Orders)
				}
			})
		}
	}
}
