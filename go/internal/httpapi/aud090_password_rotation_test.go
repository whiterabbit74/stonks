package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
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
	restarted := NewWithProviders(s.DB, s.WebDir, nil)
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
	again := NewWithProviders(s.DB, s.WebDir, nil)
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
	restarted := NewWithProviders(s.DB, s.WebDir, nil)
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
