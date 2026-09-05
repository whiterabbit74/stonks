package robinhood

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

func TestChallengeMatchesVerifier(t *testing.T) {
	v, ch, state, err := NewPKCE()
	if err != nil {
		t.Fatal(err)
	}
	if v == "" || ch == "" || state == "" {
		t.Fatal("empty pkce")
	}
	sum := sha256.Sum256([]byte(v))
	want := strings.TrimRight(base64.URLEncoding.EncodeToString(sum[:]), "=")
	if ch != want {
		t.Fatalf("challenge %s want %s", ch, want)
	}
}

func TestParseCallbackURLWithJunk(t *testing.T) {
	raw := "please open http://127.0.0.1:53682/callback?code=abc&state=st1 this failed"
	code, state, err := ParseCallbackURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if code != "abc" || state != "st1" {
		t.Fatalf("%s %s", code, state)
	}
}

func TestParseCallbackRejectsForeignHost(t *testing.T) {
	if _, _, err := ParseCallbackURL("https://evil.example/callback?code=abc&state=st1"); err == nil {
		t.Fatal("foreign callback host must be rejected")
	}
}

func TestParseCallbackRejectsMissingCode(t *testing.T) {
	if _, _, err := ParseCallbackURL("http://127.0.0.1:53682/callback?state=x"); err == nil {
		t.Fatal("expected error")
	}
}

func TestTokenJSONExtraFieldsParse(t *testing.T) {
	raw := []byte(`{"access_token":"a","token_type":"Bearer","expires_in":344000,"refresh_token":"r","scope":"internal","backup_code":"b","mfa_code":"m","user_uuid":"u"}`)
	tok, err := ParseTokenJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != "a" || tok.RefreshToken != "r" || tok.ExpiresIn != 344000 {
		t.Fatalf("%+v", tok)
	}
}

func TestCompleteFromCallbackOneTimeStateAndRefreshRotate(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		b, _ := io.ReadAll(r.Body)
		form, _ := url.ParseQuery(string(b))
		if r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
			t.Errorf("want form, got %s", r.Header.Get("Content-Type"))
		}
		if n == 1 {
			if form.Get("grant_type") != "authorization_code" || form.Get("code") != "abc" {
				t.Errorf("form %v", form)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "A1", "refresh_token": "R1", "token_type": "Bearer",
				"scope": "internal", "expires_in": 100, "backup_code": "x", "user_uuid": "u",
			})
			return
		}
		if form.Get("grant_type") != "refresh_token" || form.Get("refresh_token") != "R1" {
			t.Errorf("refresh form %v", form)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "A2", "refresh_token": "R2", "token_type": "Bearer", "expires_in": 100,
		})
	}))
	t.Cleanup(srv.Close)
	TokenURL = srv.URL
	s := New(db)
	s.HTTP = srv.Client()
	_ = db.SaveRobinhoodClientID("cid")
	_ = db.SaveRobinhoodPending("st1", "ver", RedirectURI)
	if err := s.CompleteFromCallbackURL("http://127.0.0.1:53682/callback?code=abc&state=st1"); err != nil {
		t.Fatal(err)
	}
	if db.GetRobinhoodOAuth().AccessToken != "A1" {
		t.Fatal(db.GetRobinhoodOAuth().AccessToken)
	}
	if _, _, err := db.TakeRobinhoodPending("st1"); err == nil {
		t.Fatal("state must be one-time")
	}
	if err := s.Refresh(); err != nil {
		t.Fatal(err)
	}
	row := db.GetRobinhoodOAuth()
	if row.AccessToken != "A2" || row.RefreshToken != "R2" {
		t.Fatalf("rotation %+v", row)
	}
}

func TestForeignStateRejected(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db)
	_ = db.SaveRobinhoodPending("good", "ver", RedirectURI)
	if err := s.CompleteFromCallbackURL("http://127.0.0.1:53682/callback?code=abc&state=bad"); err == nil {
		t.Fatal("foreign state")
	}
}

func TestTokenHTTP400NeedsReauth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	t.Cleanup(srv.Close)
	TokenURL = srv.URL
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db)
	s.HTTP = srv.Client()
	_ = db.SaveRobinhoodClientID("cid")
	_ = db.SaveRobinhoodTokens("a", "r", "Bearer", "internal", time.Now().Add(-time.Hour).Format(time.RFC3339))
	if err := s.Refresh(); err == nil || !strings.Contains(err.Error(), "NEEDS_REAUTH") {
		t.Fatalf("got %v", err)
	}
}

func TestExpiredPendingState(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.SQL.Exec(`INSERT INTO robinhood_oauth_pending (state, code_verifier, redirect_uri, created_at) VALUES (?,?,?,?)`,
		"old", "ver", RedirectURI, time.Now().UTC().Add(-20*time.Minute).Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.TakeRobinhoodPending("old"); err == nil {
		t.Fatal("expired state must fail")
	}
}
