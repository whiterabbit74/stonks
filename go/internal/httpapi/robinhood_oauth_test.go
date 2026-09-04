package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/robinhood"
)

func TestRobinhoodOAuthCompleteAttachesBroker(t *testing.T) {
	tok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		form, _ := url.ParseQuery(string(b))
		if form.Get("code") != "abc" {
			t.Errorf("code %s", form.Get("code"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "A1", "refresh_token": "R1", "token_type": "Bearer",
			"scope": "internal", "expires_in": 100, "backup_code": "x",
		})
	}))
	t.Cleanup(tok.Close)
	prev := robinhood.TokenURL
	t.Cleanup(func() { robinhood.TokenURL = prev })
	robinhood.TokenURL = tok.URL

	s := testServer(t, "")
	wb := &live.MemoryBroker{}
	s.Live.Broker = wb
	s.Live.Brokers = map[string]live.Broker{"webull": wb}
	_ = s.DB.SaveRobinhoodClientID("cid")
	_ = s.DB.SaveRobinhoodPending("st1", "ver", robinhood.RedirectURI)

	rec := postJSON(s, "/api/autotrade/robinhood/oauth/complete", map[string]any{
		"callbackUrl": "http://127.0.0.1:53682/callback?code=abc&state=st1",
	})
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if s.Live.BrokerNamed("robinhood") == nil {
		t.Fatal("oauth complete must put Robinhood on Engine.Brokers")
	}
	if s.Live.BrokerNamed("webull") != wb {
		t.Fatal("webull must stay in the map")
	}
	if s.DB.GetRobinhoodOAuth().AccessToken != "A1" {
		t.Fatal("tokens not saved")
	}
}
