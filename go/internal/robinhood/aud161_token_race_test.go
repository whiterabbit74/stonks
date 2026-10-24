package robinhood

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

// AUD-161: each Service had its own mutex, so the broker, the quote source and
// the scheduler refreshed the same pair at once; a rotated refresh token made
// the second exchange fail.
func TestRefreshIsSerializedAcrossServices(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var refreshes atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.PostForm.Get("refresh_token") != "R0" {
			w.WriteHeader(400) // rotated: the old refresh token is spent
			return
		}
		refreshes.Add(1)
		time.Sleep(100 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "A1", "refresh_token": "R1", "expires_in": 86400 * 7})
	}))
	t.Cleanup(srv.Close)
	TokenURL = srv.URL
	soon := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	if err := db.SaveRobinhoodTokens("A0", "R0", "Bearer", "internal", soon); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		s := New(db)
		s.HTTP = srv.Client()
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var tok string
			tok, errs[i] = s.AccessToken()
			if errs[i] == nil && tok != "A1" {
				t.Errorf("token %q, want A1", tok)
			}
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatalf("concurrent refresh failed: %v", err)
		}
	}
	if n := refreshes.Load(); n != 1 {
		t.Fatalf("refreshes = %d, want 1", n)
	}
}

// AUD-148: a refresh in flight when Disconnect cleared the row wrote the new
// pair back afterwards.
func TestRevokeWaitsForInFlightRefresh(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	inFlight := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(inFlight)
		time.Sleep(150 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "A1", "refresh_token": "R1", "expires_in": 3600})
	}))
	t.Cleanup(srv.Close)
	TokenURL = srv.URL
	if err := db.SaveRobinhoodTokens("A0", "R0", "Bearer", "internal", ""); err != nil {
		t.Fatal(err)
	}
	a, b := New(db), New(db)
	a.HTTP = srv.Client()
	done := make(chan error, 1)
	go func() { done <- a.Refresh() }()
	<-inFlight
	if err := b.Revoke(); err != nil {
		t.Fatal(err)
	}
	<-done
	if row := db.GetRobinhoodOAuth(); row.AccessToken != "" || row.RefreshToken != "" {
		t.Fatalf("tokens came back after disconnect: %+v", row)
	}
}

// AUD-162: the MCP request had a context, but fetching its token did not, so a
// slow token refresh ran past the broker read budget.
func TestMCPTokenFetchHonoursContext(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "A1", "refresh_token": "R1", "expires_in": 86400 * 7})
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(func() { close(release) })
	TokenURL = srv.URL
	soon := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	if err := db.SaveRobinhoodTokens("A0", "R0", "Bearer", "internal", soon); err != nil {
		t.Fatal(err)
	}
	s := New(db)
	s.HTTP = srv.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	if _, err := s.CallToolCtx(ctx, "get_accounts", nil); err == nil {
		t.Fatal("call must fail once its context expires")
	}
	if took := time.Since(start); took > time.Second {
		t.Fatalf("token fetch ignored the context: %v", took)
	}
}

// AUD-162 (reopened): after a 401 the tool call refreshed the token through
// Refresh() with no context, so a T-1 call waited for tokenMu and a slow
// exchange well past its deadline.
func TestUnauthorizedRefreshStopsAtDeadline(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	release := make(chan struct{})
	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "A1", "refresh_token": "R1", "expires_in": 86400 * 7})
	}))
	t.Cleanup(tokenSrv.Close)
	t.Cleanup(unblockAfter(release, 3*time.Second))
	TokenURL = tokenSrv.URL
	mcpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	t.Cleanup(mcpSrv.Close)
	later := time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339)
	if err := db.SaveRobinhoodTokens("A0", "R0", "Bearer", "internal", later); err != nil {
		t.Fatal(err)
	}
	s := New(db)
	s.HTTP = tokenSrv.Client()
	s.MCP = &MCP{HTTP: mcpSrv.Client(), Endpoint: mcpSrv.URL, Token: s.AccessTokenCtx}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err = s.CallToolCtx(ctx, "get_accounts", nil)
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("refresh after 401 ignored the deadline: %v", took)
	}
	if err == nil || err.Error() == "NEEDS_REAUTH" {
		t.Fatalf("err = %v; a deadline is not a dead token", err)
	}
}

// The same limit on the initialisation lock: a call queued behind a slow
// initialize of the same MCP returns at its own deadline.
func TestEnsureSessionWaitStopsAtDeadline(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.WriteHeader(500)
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(unblockAfter(release, 3*time.Second))
	c := &MCP{HTTP: srv.Client(), Endpoint: srv.URL}
	go func() { _, _ = c.CallCtx(context.Background(), "tools/list", nil) }() // holds the init slot
	time.Sleep(50 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	if _, err := c.CallCtx(ctx, "tools/list", nil); err == nil {
		t.Fatal("want a deadline error")
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("queued call ignored its deadline: %v", took)
	}
}

// unblockAfter closes release after d, so a regression fails on time instead
// of hanging; the returned func closes it at cleanup.
func unblockAfter(release chan struct{}, d time.Duration) func() {
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	time.AfterFunc(d, unblock)
	return unblock
}
