package webull

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// Webull отвечает «too many requests», если два запроса на одном app key
// уходят ближе, чем через 250 мс. Пауза общая на процесс: котировочный клиент
// и брокерский — два разных Client с одним ключом.
// paceJitter is the slack the assertions allow: the timestamps below are taken
// in the HTTP handler, after the round trip, so two requests can be recorded a
// fraction of a millisecond closer than they were actually sent.
const paceJitter = 2 * time.Millisecond

func TestWebullRequestsArePaced(t *testing.T) {
	var mu sync.Mutex
	var at []time.Time
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		at = append(at, time.Now())
		mu.Unlock()
		_, _ = w.Write([]byte(`{"code":0}`))
	}))
	defer ts.Close()

	old := MinRequestInterval
	MinRequestInterval = 40 * time.Millisecond
	defer func() { MinRequestInterval = old }()
	rateGateMu.Lock()
	nextSlotAt = time.Time{}
	rateGateMu.Unlock()

	quotes := &Client{Base: ts.URL, Host: "h", AppKey: "k", AppSecret: "s", AccessToken: "tok"}
	broker := &Client{Base: ts.URL, Host: "h", AppKey: "k", AppSecret: "s", AccessToken: "tok"}
	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		for _, c := range []*Client{quotes, broker} {
			wg.Add(1)
			go func(c *Client) {
				defer wg.Done()
				_, _ = c.RequestCtx(context.Background(), http.MethodGet, "/x", nil, nil, true, nil)
			}(c)
		}
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(at) != 6 {
		t.Fatalf("want 6 requests, got %d", len(at))
	}
	sort.Slice(at, func(i, j int) bool { return at[i].Before(at[j]) })
	for i := 1; i < len(at); i++ {
		// Полный интервал, а не половина, и по отсортированным отметкам: без
		// сортировки сравнение после смены знака вообще не выполнялось.
		if d := at[i].Sub(at[i-1]); d < MinRequestInterval-paceJitter {
			t.Fatalf("two Webull requests %v apart, want >= %v", d, MinRequestInterval)
		}
	}
}

// Задержка между выдачей слота и отправкой не должна позволять запросу
// догнать следующий: интервал меряется по фактическим отправкам (CORE-05).
func TestPacingSurvivesDelayBetweenSlotAndSend(t *testing.T) {
	var mu sync.Mutex
	var at []time.Time
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		at = append(at, time.Now())
		mu.Unlock()
		_, _ = w.Write([]byte(`{"code":0}`))
	}))
	defer ts.Close()

	old := MinRequestInterval
	MinRequestInterval = 60 * time.Millisecond
	defer func() { MinRequestInterval = old }()
	rateGateMu.Lock()
	nextSlotAt = time.Time{}
	rateGateMu.Unlock()

	c := &Client{Base: ts.URL, Host: "h", AppKey: "k", AppSecret: "s", AccessToken: "tok"}
	var wg sync.WaitGroup
	// Первый запрос несёт тело, которое дороже кодировать и подписывать.
	big := map[string]any{"payload": strings.Repeat("x", 1<<19)}
	for i, body := range []any{big, nil, nil} {
		wg.Add(1)
		go func(i int, body any) {
			defer wg.Done()
			_, _ = c.RequestCtx(context.Background(), http.MethodGet, "/x", nil, body, true, nil)
		}(i, body)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	sort.Slice(at, func(i, j int) bool { return at[i].Before(at[j]) })
	if len(at) != 3 {
		t.Fatalf("want 3 requests, got %d", len(at))
	}
	for i := 1; i < len(at); i++ {
		if d := at[i].Sub(at[i-1]); d < MinRequestInterval-paceJitter {
			t.Fatalf("actual sends %v apart, want >= %v", d, MinRequestInterval)
		}
	}
}

// Пауза не должна переживать отмену контекста: закрывающая минута дороже.
func TestPacingHonorsContextCancel(t *testing.T) {
	old := MinRequestInterval
	MinRequestInterval = time.Second
	defer func() { MinRequestInterval = old }()
	rateGateMu.Lock()
	nextSlotAt = time.Now().Add(time.Second)
	rateGateMu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := awaitRequestSlot(ctx); err == nil {
		t.Fatal("want the cancelled context to abort the wait")
	}
}
