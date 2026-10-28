package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (s *Server) public(r *http.Request) bool {
	p := r.URL.Path
	if r.Method == http.MethodGet && (p == "/api/status" || p == "/healthz" || p == "/readyz" || p == "/api/auth/check" || p == "/api/trading-calendar" || p == "/api/trading/expected-prev-day") {
		return true
	}
	if r.Method == http.MethodPost && (p == "/api/login" || p == "/api/logout") {
		return true
	}
	if !strings.HasPrefix(p, "/api/") {
		return true
	}
	return false
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.adminPass == "" {
			writeJSON(w, 503, map[string]any{"error": "Авторизация не настроена"})
			return
		}
		if s.public(r) {
			next(w, r)
			return
		}
		// Отзыв при старте мог не пройти (база занята): тогда старая cookie
		// после смены пароля жила до следующего рестарта (AUD-149).
		if !s.sessionsRevoked.Load() {
			if s.revokeSessionsOnCredentialChange(); !s.sessionsRevoked.Load() {
				writeJSON(w, 503, map[string]any{"error": "Хранилище сессий недоступно"})
				return
			}
		}
		s.purgeExpiredSessions()
		token := cookieToken(r)
		if token == "" {
			writeSessionExpired(w)
			return
		}
		created, exp, err := s.DB.SessionGet(token)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeSessionExpired(w)
				return
			}
			writeJSON(w, 500, map[string]any{"error": "Хранилище сессий недоступно"})
			return
		}
		if exp < time.Now().UnixMilli() {
			if err := s.DB.SessionDelete(token); err != nil {
				log.Printf("session delete expired token: %v", err)
			}
			writeSessionExpired(w)
			return
		}
		s.touchSession(w, r, token, created, exp)
		next(w, r)
	}
}

// revokeSessionsOnCredentialChange drops sessions issued under other admin
// credentials. Session rows carry only token/created_at/expires_at, so without
// this a password rotation after a leak leaves the old cookie fully valid.
func (s *Server) revokeSessionsOnCredentialChange() {
	if s.DB == nil || s.adminPass == "" {
		s.sessionsRevoked.Store(true)
		return
	}
	sum := sha256.Sum256([]byte(s.adminUser + "\x00" + s.adminPass))
	if err := s.DB.SessionsRevokeOnCredentialChange(hex.EncodeToString(sum[:])); err != nil {
		log.Printf("session revoke on credential change: %v", err)
		return
	}
	s.sessionsRevoked.Store(true)
}

func (s *Server) purgeExpiredSessions() {
	if s.DB == nil {
		return
	}
	s.purgeMu.Lock()
	if time.Since(s.lastPurge) < sessionPurgeEvery {
		s.purgeMu.Unlock()
		return
	}
	s.lastPurge = time.Now()
	s.purgeMu.Unlock()
	_, _ = s.DB.SessionDeleteExpired(time.Now().UnixMilli())
}

func cookieToken(r *http.Request) string {
	if c, err := r.Cookie("auth_token"); err == nil {
		return c.Value
	}
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		t := strings.TrimSpace(h[7:])
		if len(t) == 32 {
			return t
		}
	}
	return ""
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if s.adminPass == "" {
		writeJSON(w, 503, map[string]any{"error": "Авторизация не настроена"})
		return
	}
	var body struct {
		Username   string `json:"username"`
		Password   string `json:"password"`
		Remember   bool   `json:"remember"`
		RememberMe bool   `json:"rememberMe"`
	}
	if err := readJSON(r, &body); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	if body.Username == "" || len(body.Username) > 254 || body.Password == "" || len(body.Password) > 1024 {
		writeJSON(w, 400, map[string]any{"error": "Неверный формат имени пользователя"})
		return
	}
	if !s.checkPassword(body.Username, body.Password) {
		writeJSON(w, 401, map[string]any{"error": "Неверный логин или пароль"})
		return
	}
	tok, err := randomToken()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось создать сессию"})
		return
	}
	remember := body.Remember || body.RememberMe
	ttl := sessionShortTTL
	if remember {
		ttl = sessionRemember
	}
	now := time.Now()
	s.purgeExpiredSessions()
	if err := s.DB.SessionSet(tok, now.UnixMilli(), now.Add(ttl).UnixMilli()); err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось создать сессию"})
		return
	}
	s.setAuthCookie(w, r, tok, ttl)
	writeJSON(w, 200, map[string]any{"success": true})
}

func sessionTTL(created, expires int64) time.Duration {
	span := time.Duration(expires-created) * time.Millisecond
	if span > 7*24*time.Hour {
		return sessionRemember
	}
	return sessionShortTTL
}

func (s *Server) setAuthCookie(w http.ResponseWriter, r *http.Request, tok string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cookieSecure(r),
		MaxAge:   int(ttl.Seconds()),
	})
}

func (s *Server) touchSession(w http.ResponseWriter, r *http.Request, token string, created, exp int64) {
	ttl := sessionTTL(created, exp)
	now := time.Now()
	if time.UnixMilli(exp).Sub(now) > ttl-sessionTouchEvery {
		return
	}
	// created сдвигается вместе со сроком: тип сессии читается из разницы
	// expires-created, и с исходным created короткая сессия через неделю
	// активности становилась 30-дневной (AUD-166).
	if ok, err := s.DB.SessionExtend(token, now.UnixMilli(), now.Add(ttl).UnixMilli()); err != nil || !ok {
		return // logged out meanwhile: neither the row nor the cookie comes back
	}
	s.setAuthCookie(w, r, token, ttl)
}

func (s *Server) cookieSecure(r *http.Request) bool {
	if s.prod {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func constantTimePassword(got, want string) bool {
	gb, wb := []byte(got), []byte(want)
	if len(gb) != len(wb) {
		return false
	}
	return subtle.ConstantTimeCompare(gb, wb) == 1
}

// dummyBcryptHash is a cost-10 hash of an unguessable password.
// Unknown-user logins compare against it so work matches a real bcrypt check.
const dummyBcryptHash = "$2a$10$oH6blETWrWz4TLnjkVGukOupaLNXSM0eOkxUVtn5DS4ngC5yVNam6"

func (s *Server) checkPassword(username, password string) bool {
	userOK := strings.ToLower(username) == s.adminUser
	if strings.HasPrefix(s.adminPass, "$2") {
		hash := []byte(dummyBcryptHash)
		if userOK {
			hash = []byte(s.adminPass)
		}
		passOK := bcrypt.CompareHashAndPassword(hash, []byte(password)) == nil
		return userOK && passOK
	}
	_ = bcrypt.CompareHashAndPassword([]byte(dummyBcryptHash), []byte(password))
	passOK := constantTimePassword(password, s.adminPass)
	return userOK && passOK
}

func (s *Server) handleAuthCheck(w http.ResponseWriter, r *http.Request) {
	if s.adminPass == "" {
		writeJSON(w, 503, map[string]any{"error": "Авторизация не настроена"})
		return
	}
	s.purgeExpiredSessions()
	tok := cookieToken(r)
	_, exp, err := s.DB.SessionGet(tok)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, 401, map[string]any{"error": "Unauthorized", "code": "session_expired"})
			return
		}
		writeJSON(w, 500, map[string]any{"error": "Хранилище сессий недоступно"})
		return
	}
	if exp < time.Now().UnixMilli() {
		writeJSON(w, 401, map[string]any{"error": "Unauthorized", "code": "session_expired"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: "auth_token", Value: "", Path: "/", HttpOnly: true, MaxAge: -1,
		SameSite: http.SameSiteLaxMode, Secure: s.cookieSecure(r),
	})
	if tok := cookieToken(r); tok != "" {
		if err := s.DB.SessionDelete(tok); err != nil {
			writeJSON(w, 500, map[string]any{"error": "Не удалось удалить сессию"})
			return
		}
	}
	writeJSON(w, 200, map[string]any{"success": true})
}

func (s *Server) handleHashPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"hash": string(hash)})
}

func randomToken() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func writeSessionExpired(w http.ResponseWriter) {
	writeJSON(w, 401, map[string]any{"error": "Unauthorized", "code": "session_expired"})
}
