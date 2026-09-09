package httpapi

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// AUD-089: заполнение общей таблицы ограничителя вытесняло ещё действующие
// запреты, и трафик с других адресов снимал блокировку входа.
func TestRateLimitEvictionKeepsActiveBan(t *testing.T) {
	t.Setenv("TRUST_PROXY", "false")
	s := &Server{limiter: newIPLimiter()}
	h := s.rateLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	call := func(ip, method, path string) int {
		r := httptest.NewRequest(method, path, nil)
		r.RemoteAddr = ip + ":1234"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	for i := 0; i < limitLogin; i++ {
		if got := call("198.51.100.1", "POST", "/api/login"); got != 204 {
			t.Fatalf("early rejection on attempt %d: %d", i+1, got)
		}
	}
	if got := call("198.51.100.1", "POST", "/api/login"); got != 429 {
		t.Fatalf("missing initial cap: %d", got)
	}
	for i := 0; i < 2*maxRateBuckets; i++ {
		call(fmt.Sprintf("2001:db8::%x", i+1), "GET", "/api/status")
	}
	if got := call("198.51.100.1", "POST", "/api/login"); got != 429 {
		t.Fatalf("действующий запрет снят вытеснением: %d", got)
	}
	if n := len(s.limiter.buckets); n > maxRateBuckets {
		t.Fatalf("таблица ограничителя разрослась до %d ключей", n)
	}
}
