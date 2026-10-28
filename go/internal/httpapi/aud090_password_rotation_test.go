package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// AUD-090: смена ADMIN_PASSWORD не отзывала выданные сессии — старая cookie
// продолжала открывать защищённый API после ротации.
func TestPasswordRotationRevokesSessions(t *testing.T) {
	s := testServer(t, "before-rotation")
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"username":"admin@example.com","password":"before-rotation"}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("login %d", w.Code)
	}
	cookie := w.Result().Cookies()[0]

	t.Setenv("ADMIN_PASSWORD", "after-rotation")
	restarted := NewWithProviders(s.DB, s.WebDir, nil, s.Live)
	r = httptest.NewRequest("GET", "/api/settings", nil)
	r.AddCookie(cookie)
	w = httptest.NewRecorder()
	restarted.Handler().ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("старая сессия пережила ротацию пароля: %d", w.Code)
	}

	// Новый пароль по-прежнему выдаёт рабочую сессию, а перезапуск без смены
	// учётных данных её не сбрасывает.
	r = httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"username":"admin@example.com","password":"after-rotation"}`))
	w = httptest.NewRecorder()
	restarted.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("login после ротации %d", w.Code)
	}
	fresh := w.Result().Cookies()[0]
	again := NewWithProviders(s.DB, s.WebDir, nil, s.Live)
	r = httptest.NewRequest("GET", "/api/settings", nil)
	r.AddCookie(fresh)
	w = httptest.NewRecorder()
	again.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("перезапуск без смены пароля отозвал живую сессию: %d", w.Code)
	}
}

// AUD-149: a failed DELETE at start was only logged, and the old cookie stayed
// valid until the next restart.
func TestFailedRevokeKeepsOldSessionsOut(t *testing.T) {
	s := testServer(t, "before-rotation")
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"username":"admin@example.com","password":"before-rotation"}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("login %d", w.Code)
	}
	cookie := w.Result().Cookies()[0]
	if _, err := s.DB.SQL.Exec(`CREATE TRIGGER keep_sessions BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'locked'); END;`); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ADMIN_PASSWORD", "after-rotation")
	restarted := NewWithProviders(s.DB, s.WebDir, nil, s.Live)
	get := func() int {
		r := httptest.NewRequest("GET", "/api/settings", nil)
		r.AddCookie(cookie)
		w := httptest.NewRecorder()
		restarted.Handler().ServeHTTP(w, r)
		return w.Code
	}
	if code := get(); code == 200 {
		t.Fatal("old session accepted while the revoke has not gone through")
	}
	if _, err := s.DB.SQL.Exec(`DROP TRIGGER keep_sessions`); err != nil {
		t.Fatal(err)
	}
	if code := get(); code != 401 {
		t.Fatalf("after the retried revoke the old session must be gone, got %d", code)
	}
}

// AUD-166: renewing a short session kept its original created_at, and after a
// week of activity expires-created read as a "remember me" session.
func TestShortSessionStaysShortAfterRenewals(t *testing.T) {
	s := testServer(t, "pw")
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"username":"admin@example.com","password":"pw"}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	cookie := w.Result().Cookies()[0]
	// Almost a week of daily use: still short now, about to be renewed.
	now := time.Now()
	if err := s.DB.SessionSet(cookie.Value, now.Add(-163*time.Hour).UnixMilli(), now.Add(time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	r = httptest.NewRequest("GET", "/api/settings", nil)
	r.AddCookie(cookie)
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("settings %d", w.Code)
	}
	created, exp, err := s.DB.SessionGet(cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	if got := sessionTTL(created, exp); got != sessionShortTTL {
		t.Fatalf("renewed short session became %v", got)
	}
}

// AUD-179: request A read a session due for renewal, request B logged out,
// then A renewed it through INSERT OR REPLACE — the deleted token was valid
// again and A's answer set the cookie anew.
func TestRenewalAfterLogoutDoesNotRestoreSession(t *testing.T) {
	s := testServer(t, "pw")
	created := time.Now().Add(-time.Hour)
	exp := created.Add(sessionShortTTL)
	if err := s.DB.SessionSet("tok-1", created.UnixMilli(), exp.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.SessionDelete("tok-1"); err != nil { // B's logout
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.touchSession(w, httptest.NewRequest("GET", "/api/settings", nil), "tok-1", created.UnixMilli(), exp.UnixMilli())
	if _, _, err := s.DB.SessionGet("tok-1"); err == nil {
		t.Fatal("renewal brought the logged-out session back")
	}
	if c := w.Result().Cookies(); len(c) != 0 {
		t.Fatalf("renewal set the cookie again: %+v", c)
	}

	// A live session is still renewed.
	if err := s.DB.SessionSet("tok-2", created.UnixMilli(), exp.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	s.touchSession(w, httptest.NewRequest("GET", "/api/settings", nil), "tok-2", created.UnixMilli(), exp.UnixMilli())
	if _, got, err := s.DB.SessionGet("tok-2"); err != nil || got <= exp.UnixMilli() || len(w.Result().Cookies()) != 1 {
		t.Fatalf("live session not renewed: exp %d err %v cookies %v", got, err, w.Result().Cookies())
	}
}
