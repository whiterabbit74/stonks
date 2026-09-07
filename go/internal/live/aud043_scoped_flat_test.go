package live

import "testing"

// AUD-043: awaitFlatAfterExit смотрел журнал целиком. Позиция, открытая у
// другого брокера, делала успешный выход похожим на сорвавшийся: цикл T-1
// логировал t1_exit_rejected_retry и пропускал повторный вход.
func TestJournalFlatIsScopedToExitingBroker(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	mustInsertBrokerTrade(t, e, "r-spy", "SPY", "robinhood", "2026-09-01", 1)

	if flat, err := e.journalFlat([]string{"webull"}); err != nil || !flat {
		t.Fatalf("Webull is flat while Robinhood holds SPY: flat=%v err=%v", flat, err)
	}
	if flat, err := e.journalFlat([]string{"robinhood"}); err != nil || flat {
		t.Fatalf("Robinhood holds SPY: flat=%v err=%v", flat, err)
	}
	if flat, err := e.journalFlat(nil); err != nil || flat {
		t.Fatalf("unscoped check must still see the open trade: flat=%v err=%v", flat, err)
	}
}

func TestExitingBrokersListsOnlyExits(t *testing.T) {
	res := EvalResult{BrokerDecisions: map[string]map[string]any{
		"webull":    {"action": "exit"},
		"robinhood": {"action": "entry"},
	}}
	got := exitingBrokers(res)
	if len(got) != 1 || got[0] != "webull" {
		t.Fatalf("exitingBrokers = %v, want [webull]", got)
	}
	if len(exitingBrokers(EvalResult{})) != 0 {
		t.Fatal("no per-broker decisions must fall back to the unscoped scope")
	}
}
