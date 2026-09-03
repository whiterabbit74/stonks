package httpapi

import (
	"net/http"
	"testing"
)

func req(remote, xff string) *http.Request {
	r, _ := http.NewRequest(http.MethodGet, "/api/status", nil)
	r.RemoteAddr = remote
	if xff != "" {
		r.Header.Set("X-Forwarded-For", xff)
	}
	return r
}

func TestClientIPIgnoresForwardedHeaderByDefault(t *testing.T) {
	t.Setenv("TRUST_PROXY", "")
	if got := clientIP(req("10.0.0.5:5555", "1.2.3.4")); got != "10.0.0.5" {
		t.Fatalf("got %q, want the socket address 10.0.0.5", got)
	}
}

func TestClientIPTakesRightmostForwardedEntryWhenTrusted(t *testing.T) {
	t.Setenv("TRUST_PROXY", "true")
	// Caddy appends the peer address, so a client-supplied prefix must not win.
	if got := clientIP(req("172.18.0.2:5555", "1.2.3.4, 203.0.113.9")); got != "203.0.113.9" {
		t.Fatalf("got %q, want 203.0.113.9", got)
	}
	if got := clientIP(req("172.18.0.2:5555", "203.0.113.9")); got != "203.0.113.9" {
		t.Fatalf("single-hop: got %q, want 203.0.113.9", got)
	}
}

func TestLoginLimiterIsPerIP(t *testing.T) {
	l := newIPLimiter()
	for i := 0; i < limitLogin; i++ {
		if !l.allow("login:a", limitLogin) {
			t.Fatalf("attempt %d rejected early", i)
		}
	}
	if l.allow("login:a", limitLogin) {
		t.Fatal("limiter let a request through past the cap")
	}
	if !l.allow("login:b", limitLogin) {
		t.Fatal("a different IP must have its own bucket")
	}
}
