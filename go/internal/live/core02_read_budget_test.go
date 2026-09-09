package live

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

// blockingBroker никогда не отвечает сам — только по отмене контекста, как
// зависший брокерский API.
type blockingBroker struct {
	MemoryBroker
	calls chan struct{}
}

func (b *blockingBroker) Positions(ctx context.Context) ([]any, error) {
	select {
	case b.calls <- struct{}{}:
	default:
	}
	<-ctx.Done()
	return nil, ctx.Err()
}

func budgetEngine(t *testing.T) *Engine {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	return e
}

// CORE-02: зависший брокер не имеет права занять всю закрывающую минуту.
// Чтение обязано оборваться по своему бюджету, а не по общему дедлайну.
func TestHungBrokerReadStopsAtItsOwnBudget(t *testing.T) {
	e := budgetEngine(t)
	oldTimeout, oldReserve := T1ReadAttemptTimeout, T1PlacementReserve
	T1ReadAttemptTimeout = 60 * time.Millisecond
	T1PlacementReserve = 200 * time.Millisecond
	defer func() { T1ReadAttemptTimeout, T1PlacementReserve = oldTimeout, oldReserve }()

	br := &blockingBroker{calls: make(chan struct{}, 8)}
	w := execWindow{ctx: context.Background(), deadline: time.Now().Add(3 * time.Second)}
	start := time.Now()
	_, err := e.heldSymbolsOn(br, w)
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("a hung read must fail, not hang")
	}
	// Три попытки по 60 мс, а не одно ожидание в три секунды.
	if elapsed > time.Second {
		t.Fatalf("a hung broker held the window for %v", elapsed)
	}
}

// Когда до закрытия осталось меньше зарезервированного на саму заявку, новое
// чтение не начинается вовсе.
func TestReadsStopBeforeThePlacementReserve(t *testing.T) {
	e := budgetEngine(t)
	oldReserve := T1PlacementReserve
	T1PlacementReserve = 10 * time.Second
	defer func() { T1PlacementReserve = oldReserve }()

	br := &blockingBroker{calls: make(chan struct{}, 8)}
	w := execWindow{ctx: context.Background(), deadline: time.Now().Add(2 * time.Second)}
	start := time.Now()
	if _, err := e.heldSymbolsOn(br, w); err == nil {
		t.Fatal("want the read refused")
	}
	if elapsed := time.Since(start); elapsed > 200*time.Millisecond {
		t.Fatalf("the read must not be attempted at all, took %v", elapsed)
	}
	select {
	case <-br.calls:
		t.Fatal("the broker must not have been called inside the placement reserve")
	default:
	}
}

// Без дедлайна (ручной запуск, фоновые пути) бюджет чтения не применяется как
// «время вышло»: попытка всё равно делается.
func TestBackgroundWindowStillReads(t *testing.T) {
	e := budgetEngine(t)
	if got := e.readBudget(backgroundWindow()); got != T1ReadAttemptTimeout {
		t.Fatalf("background read budget = %v, want %v", got, T1ReadAttemptTimeout)
	}
}

// Резерв закрывающей минуты существует ради самой заявки: чтения, входящие в
// отправку (размер позиции), и сама отправка внутри резерва обязаны идти.
func TestPlacementReadsIgnoreTheReserve(t *testing.T) {
	e := budgetEngine(t)
	oldReserve := T1PlacementReserve
	T1PlacementReserve = 10 * time.Second
	defer func() { T1PlacementReserve = oldReserve }()
	w := execWindow{ctx: context.Background(), deadline: time.Now().Add(2 * time.Second)}
	if got := e.readBudget(w); got != 0 {
		t.Fatalf("pre-flight budget inside the reserve = %v, want 0", got)
	}
	if got := e.readBudget(w.forPlacement()); got <= time.Second {
		t.Fatalf("placement budget = %v, want the remaining window", got)
	}
	br := &MemoryBroker{Pos: []any{map[string]any{"symbol": "AAPL", "quantity": 3.0}}}
	qty, err := e.sizeOrder("exit", "AAPL", map[string]any{}, 10, br, w.forPlacement())
	if err != nil || qty != 3 {
		t.Fatalf("an exit inside the reserve must still size: qty=%v err=%v", qty, err)
	}
}
