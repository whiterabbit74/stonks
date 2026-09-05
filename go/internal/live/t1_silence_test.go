package live

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// 2026-09-04 incident: T-11 announced ENTRY MSFT, T-1 answered "Действий нет".
// The engine had in fact decided broker_positions_unavailable — a single Webull
// positions read that failed inside Evaluate seconds after the same call had
// succeeded twice in t1BrokerReconcile. Two defects: the read was the only
// broker read on the T-1 path without a retry, and the decision reason never
// reached the message.

func TestHeldSymbolsRetriesTransientPositionsFailure(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.9})
	br := &MemoryBroker{FailPositions: fmt.Errorf("webull: 502"), FailPositionsN: 2}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}})
	e.Broker = br
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	ev := e.Evaluate()
	if action, _ := ev.Decision["action"].(string); action != "entry" {
		t.Fatalf("a transient positions read must not cost the entry: %+v", ev.Decision)
	}
}

func TestT1NoActionLinesExplainTheReason(t *testing.T) {
	rows := []t1Watch{{sym: "MSFT", eval: watchEval{ok: true, entry: true, ibs: 0.06}}}
	exitRes := EvalResult{BrokerDecisions: map[string]map[string]any{
		"webull": {"action": "none", "reason": "broker_positions_unavailable"},
	}}
	lines := strings.Join(t1NoActionLines(exitRes, EvalResult{}, rows), "\n")
	if strings.Contains(lines, "Действий нет") {
		t.Fatalf("a skipped decision must not read as no-action:\n%s", lines)
	}
	if !strings.Contains(lines, "Webull: позиции брокера не читаются") {
		t.Fatalf("want the broker reason:\n%s", lines)
	}
	if !strings.Contains(lines, "Сигнал входа был: MSFT (IBS 6.0%)") {
		t.Fatalf("want the unexecuted entry signal:\n%s", lines)
	}
}

func TestT1NoActionLinesNameTheForeignPosition(t *testing.T) {
	exitRes := EvalResult{Decision: map[string]any{
		"action": "none", "reason": "broker_position_not_in_journal", "symbol": "AAL",
	}}
	lines := strings.Join(t1NoActionLines(exitRes, EvalResult{}, nil), "\n")
	if !strings.Contains(lines, "AAL") || !strings.Contains(lines, "вход заблокирован") {
		t.Fatalf("want the blocking position named:\n%s", lines)
	}
}

// The T-11 warning line read "monitor OPEN · broker OPEN" whatever the books
// said: a nil map[string]any stored in an interface is not == nil.
func TestConsistencyIssueLineReportsFlatBooks(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Broker = &MemoryBroker{Pos: []any{map[string]any{"symbol": "AAL", "quantity": 1.0}}}
	snap := e.Consistency()
	issues, _ := snap["issues"].([]map[string]any)
	if len(issues) != 1 {
		t.Fatalf("want the foreign position flagged once: %+v", issues)
	}
	line := formatConsistencyIssueLine(issues[0], snap)
	if !strings.Contains(line, "monitor FLAT") || !strings.Contains(line, "broker FLAT") {
		t.Fatalf("both journals are flat here: %s", line)
	}
}
