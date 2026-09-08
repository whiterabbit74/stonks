package webull

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// Webull отвечает «too many requests», если два запроса на одном app key
// уходят ближе, чем через 250 мс. Пауза общая на процесс: котировочный клиент
// и брокерский — два разных Client с одним ключом.
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
	for i := 0; i < len(at); i++ {
		for j := i + 1; j < len(at); j++ {
			if d := at[j].Sub(at[i]); d < 0 {
				d = -d
			} else if d < MinRequestInterval/2 {
				t.Fatalf("two Webull requests %v apart, want >= %v", d, MinRequestInterval)
			}
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
