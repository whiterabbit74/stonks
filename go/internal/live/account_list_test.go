package live

import (
	"errors"
	"testing"
)

var errListFailed = errors.New("account list failed")

type listBroker struct {
	MemoryBroker
	rows []any
	err  error
}

func (b *listBroker) AccountList() ([]any, error) { return b.rows, b.err }

// Список счетов раньше подделывался из WEBULL_ACCOUNT_ID, поэтому пустая
// таблица позиций не отличалась от «в конфиге не тот счёт».
func TestAccountUsesBrokerAccountList(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	br := &listBroker{rows: []any{map[string]any{"account_id": "REAL-1"}}}
	e.Broker = br
	e.Brokers = nil
	out, err := e.Account()
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := out["accounts"].([]any)
	if len(rows) != 1 {
		t.Fatalf("accounts = %+v", out["accounts"])
	}
	if got := mapOf(rows[0])["account_id"]; got != "REAL-1" {
		t.Fatalf("account id = %v, want the broker's own", got)
	}
	if out["configuredAccountId"] == nil {
		t.Fatal("the configured id must stay visible for comparison")
	}
}

func TestAccountFallsBackWhenListFails(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	br := &listBroker{err: errListFailed}
	e.Broker = br
	e.Brokers = nil
	out, err := e.Account()
	if err != nil {
		t.Fatal(err)
	}
	if out["accountsError"] == nil {
		t.Fatal("a failed list must be reported, not hidden")
	}
	if rows, _ := out["accounts"].([]any); len(rows) != 1 {
		t.Fatalf("configured fallback must stay: %+v", out["accounts"])
	}
}
