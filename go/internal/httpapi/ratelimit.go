package httpapi

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	rateWindow  = 15 * time.Minute
	limitAPI    = 500
	limitLogin  = 10
	limitHash   = 5
	limitCalc   = 30
	limitUpload = 10
)

type rateBucket struct {
	reset time.Time
	count int
}

type ipLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

func newIPLimiter() *ipLimiter {
	return &ipLimiter{buckets: map[string]*rateBucket{}}
}

func (l *ipLimiter) allow(key string, max int) bool {
	if l == nil || max <= 0 {
		return true
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, b := range l.buckets {
		if now.After(b.reset) {
			delete(l.buckets, k)
		}
	}
	b := l.buckets[key]
	if b == nil || now.After(b.reset) {
		l.buckets[key] = &rateBucket{reset: now.Add(rateWindow), count: 1}
		return true
	}
	if b.count >= max {
		return false
	}
	b.count++
	return true
}

// trustProxy mirrors Node's `app.set('trust proxy', TRUST_PROXY)`, which
// defaults to false. X-Forwarded-For is caller-controlled, so honouring it
// unconditionally lets one client mint a fresh rate-limit bucket per request
// and walk straight past the login limiter.
func trustProxy() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("TRUST_PROXY"))) {
	case "", "false", "0", "off", "no":
		return false
	default:
		return true
	}
}

func clientIP(r *http.Request) string {
	if trustProxy() {
		// Caddy appends the peer address to any X-Forwarded-For the client
		// sent, so only the RIGHTMOST entry is written by the trusted hop.
		// Reading the leftmost would hand the attacker the bucket key.
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r)
		if !s.limiter.allow("api:"+ip, limitAPI) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many API requests from this IP, please try again later."})
			return
		}
		if r.Method == http.MethodPost && r.URL.Path == "/api/login" {
			if !s.limiter.allow("login:"+ip, limitLogin) {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many attempts. Try again later."})
				return
			}
		}
		if r.Method == http.MethodPost && r.URL.Path == "/api/auth/hash-password" {
			if !s.limiter.allow("hash:"+ip, limitHash) {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many requests. Try again later."})
				return
			}
		}
		if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/calc/") {
			if !s.limiter.allow("calc:"+ip, limitCalc) {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many calculation requests from this IP, please try again later."})
				return
			}
		}
		if isUploadPath(r) {
			if !s.limiter.allow("upload:"+ip, limitUpload) {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Too many uploads from this IP, please try again later."})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func isUploadPath(r *http.Request) bool {
	p := r.URL.Path
	if r.Method == http.MethodPost && p == "/api/datasets" {
		return true
	}
	if r.Method == http.MethodPut && strings.HasPrefix(p, "/api/datasets/") && !strings.Contains(p[len("/api/datasets/"):], "/") {
		return true
	}
	return false
}

func (s *Server) checkOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !originRequired(r.Method) || !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			if strings.EqualFold(r.Header.Get("Sec-Fetch-Site"), "cross-site") {
				writeJSON(w, http.StatusForbidden, map[string]any{"error": "origin not allowed"})
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if originAllowed(origin, r.Host) {
			next.ServeHTTP(w, r)
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "origin not allowed"})
	})
}

func originRequired(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func originAllowed(origin, reqHost string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, reqHost) {
		return true
	}
	allowed := strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	if allowed == "" {
		return false
	}
	return strings.TrimRight(origin, "/") == strings.TrimRight(allowed, "/")
}
