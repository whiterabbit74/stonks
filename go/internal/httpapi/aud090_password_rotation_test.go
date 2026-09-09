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
