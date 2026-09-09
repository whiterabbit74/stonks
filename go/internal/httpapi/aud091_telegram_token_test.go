package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/live"
)

type failTransport struct{}

func (failTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("synthetic network failure")
}

// AUD-091: сетевой сбой Telegram возвращал url.Error с URL /bot<TOKEN>/…,
// и токен попадал в ответ API, в Reason и в журнал планировщика.
func TestTelegramTransportErrorHidesToken(t *testing.T) {
	s := testServer(t, "")
	token := "123456:SYNTHETIC_NOT_A_REAL_SECRET"
	s.Live.Telegram = &live.HTTPTelegram{Token: token, Client: &http.Client{Transport: failTransport{}}}
	s.Live.ChatID = "synthetic-chat"
	r := httptest.NewRequest("POST", "/api/telegram/test", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	body := w.Body.String()
	if strings.Contains(body, token) || strings.Contains(body, "123456:") {
		t.Fatalf("токен бота в ответе: %s", body)
	}
	if !strings.Contains(body, "api.telegram.org") || !strings.Contains(body, "synthetic network failure") {
		t.Fatalf("причина отказа потеряна: %s", body)
	}
}
