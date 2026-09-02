package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/types"
)

func liveServer(t *testing.T) (*Server, *live.MemoryTelegram, *live.MemoryBroker) {
	t.Helper()
	s := testServer(t, "")
	tg := &live.MemoryTelegram{}
	br := &live.MemoryBroker{}
	bars := []types.OHLC{
		{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
	}
	q := &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}}
	s.Live.Telegram = tg
	s.Live.Broker = br
	s.Live.Quotes = q
	s.Live.ChatID = "test-chat"
	if err := s.DB.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75, "chatId": "test-chat"}); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	return s, tg, br
}

func postJSON(s *Server, path string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func TestLivePathsAreNotJsonOKStubs(t *testing.T) {
	s, tg, br := liveServer(t)

	rec := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "overview"})
	if rec.Code != 200 {
		t.Fatalf("simulate overview %d %s", rec.Code, rec.Body.String())
	}
	var sim map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &sim)
	if sim["success"] != true || sim["stage"] != "overview" {
		t.Fatalf("overview %v", sim)
	}
	if len(tg.Messages) == 0 || !strings.Contains(tg.Messages[0][1], "AAPL") {
		t.Fatalf("telegram payload missing AAPL: %+v", tg.Messages)
	}

	rec = postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "confirmations"})
	_ = json.Unmarshal(rec.Body.Bytes(), &sim)
	if sim["stage"] != "confirmations" {
		t.Fatalf("confirmations %v", sim)
	}

	more := []types.OHLC{
		{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
		{Date: "2026-09-02", Open: 8, High: 9, Low: 7, Close: 8.5, Volume: 1},
	}
	s.Live.Quotes = &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": more}}
	rec = postJSON(s, "/api/telegram/actualize-prices", map[string]any{})
	if rec.Code != 200 {
		t.Fatalf("actualize %d %s", rec.Code, rec.Body.String())
	}
	bars, _, _ := s.DB.GetOHLC("AAPL")
	if len(bars) < 2 {
		t.Fatalf("OHLC not persisted, got %d bars", len(bars))
	}

	rec = postJSON(s, "/api/telegram/update-all", map[string]any{})
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "prices") {
		t.Fatalf("update-all %d %s", rec.Code, rec.Body.String())
	}

	req := httptest.NewRequest("PATCH", "/api/autotrade/config", bytes.NewReader(mustJSON(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "fixedQuantity": 1,
	})))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("patch config %d %s", rec.Code, rec.Body.String())
	}

	s2 := New(s.DB, s.WebDir)
	req = httptest.NewRequest("GET", "/api/autotrade/config", nil)
	rec = httptest.NewRecorder()
	s2.Handler().ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"enabled":true`) && !strings.Contains(rec.Body.String(), `"enabled": true`) {
		t.Fatalf("config did not persist across reopen: %s", rec.Body.String())
	}

	put := httptest.NewRequest("PUT", "/api/autotrade/webull/token", bytes.NewReader(mustJSON(map[string]any{"token": "abc"})))
	put.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, put)
	st := httptest.NewRequest("GET", "/api/autotrade/webull/token/status", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, st)
	if !strings.Contains(rec.Body.String(), `"hasToken":true`) && !strings.Contains(rec.Body.String(), `"present":true`) {
		t.Fatalf("token status %s", rec.Body.String())
	}

	rec = postJSON(s, "/api/autotrade/execute", map[string]any{})
	body := rec.Body.String()
	if strings.Contains(body, "live orders disabled in local Go rewrite") {
		t.Fatalf("execute still stub: %s", body)
	}
	if rec.Code != 200 {
		t.Fatalf("execute %d %s", rec.Code, body)
	}
	var ex map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ex)
	if ex["executed"] != true {
		t.Fatalf("expected submitted execute, got %s", body)
	}
	if len(br.Orders) == 0 {
		t.Fatal("broker PlaceMarket not called")
	}
}

func TestNoJsonOKCannedMap(t *testing.T) {
	raw, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	txt := string(raw)
	if strings.Contains(txt, "live orders disabled in local Go rewrite") {
		t.Fatal("canned execute stub still in server.go")
	}
	if strings.Contains(txt, `"simulated": true`) {
		t.Fatal("canned simulate stub still in server.go")
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
