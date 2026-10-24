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
