package live

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPTelegramTreatsOkFalseAsError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/sendMessage") {
			http.NotFound(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		_ = json.Unmarshal(body, &payload)
		if payload["parse_mode"] != "HTML" {
			t.Errorf("parse_mode %v", payload["parse_mode"])
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":false,"description":"can't parse entities"}`))
	}))
	t.Cleanup(ts.Close)
	h := &HTTPTelegram{Token: "tok", Client: ts.Client()}
	// Point the client at the test server by using a custom transport via Base isn't
	// available — rewrite the URL by substituting the host through the test client
	// and a Redirect. Easier: call Send against api.telegram.org would miss the
	// test server. Patch via a roundtripper that remaps the host.
	h.Client = ts.Client()
	h.Client.Transport = rewriteHost{base: ts.URL, rt: ts.Client().Transport}
	err := h.Send("1", "<b>hi</b>")
	if err == nil || !strings.Contains(err.Error(), "can't parse entities") {
		t.Fatalf("want parse error, got %v", err)
	}
}

type rewriteHost struct {
	base string
	rt   http.RoundTripper
}

func (r rewriteHost) RoundTrip(req *http.Request) (*http.Response, error) {
	u := strings.TrimRight(r.base, "/") + req.URL.RequestURI()
	nr, err := http.NewRequest(req.Method, u, req.Body)
	if err != nil {
		return nil, err
	}
	nr.Header = req.Header
	rt := r.rt
	if rt == nil {
		rt = http.DefaultTransport
	}
	return rt.RoundTrip(nr)
}
