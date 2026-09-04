package scheduler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/robinhood"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func TestRobinhoodHealthJobRefreshAndGetAccounts(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var refreshed, probed bool
	tok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		form, _ := url.ParseQuery(string(b))
		if form.Get("grant_type") != "refresh_token" {
			t.Errorf("want refresh, got %s", form.Get("grant_type"))
		}
		refreshed = true
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "A2", "refresh_token": "R2", "token_type": "Bearer", "expires_in": 864000,
		})
	}))
	t.Cleanup(tok.Close)
	mcp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		var msg map[string]any
		_ = json.Unmarshal(b, &msg)
		switch msg["method"] {
		case "initialize":
			w.Header().Set("Mcp-Session-Id", "s1")
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{}})
		case "notifications/initialized":
			w.WriteHeader(204)
		case "tools/call":
			params, _ := msg["params"].(map[string]any)
			if params["name"] == "get_accounts" {
				probed = true
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{
				"content": []any{map[string]any{"type": "text", "text": `{"accounts":[]}`}},
			}})
		default:
			w.WriteHeader(400)
		}
	}))
	t.Cleanup(mcp.Close)
	prevTok, prevMCP := robinhood.TokenURL, robinhood.MCPEndpoint
	t.Cleanup(func() { robinhood.TokenURL, robinhood.MCPEndpoint = prevTok, prevMCP })
	robinhood.TokenURL = tok.URL
	robinhood.MCPEndpoint = mcp.URL
	_ = db.SaveRobinhoodClientID("cid")
	_ = db.SaveRobinhoodTokens("A1", "R1", "Bearer", "internal", time.Now().Add(48*time.Hour).Format(time.RFC3339))
	now := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	hs := RunBrokerHealth(db, Deps{}, today, now)
	if !refreshed {
		t.Fatal("daily job must Refresh()")
	}
	if !probed {
		t.Fatal("daily job must call get_accounts")
	}
	found := false
	for _, h := range hs {
		if h.Broker == "robinhood" && h.Status == live.HealthOK {
			found = true
		}
	}
	if !found {
		t.Fatalf("want OK after probe, got %+v stored=%s", hs, db.GetRobinhoodOAuth().LastCheckStatus)
	}
	if db.GetRobinhoodOAuth().LastCheckStatus != live.HealthOK && db.GetRobinhoodOAuth().LastCheckStatus != "OK" {
		t.Fatalf("persist %s", db.GetRobinhoodOAuth().LastCheckStatus)
	}
}

func TestRobinhoodHealthJobNeedsReauthOn400(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	t.Cleanup(tok.Close)
	prevTok := robinhood.TokenURL
	t.Cleanup(func() { robinhood.TokenURL = prevTok })
	robinhood.TokenURL = tok.URL
	_ = db.SaveRobinhoodClientID("cid")
	_ = db.SaveRobinhoodTokens("A1", "R1", "Bearer", "internal", time.Now().Add(time.Hour).Format(time.RFC3339))
	now := time.Date(2026, 9, 2, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	RunBrokerHealth(db, Deps{}, today, now)
	if db.GetRobinhoodOAuth().LastCheckStatus != live.HealthNeedsReauth {
		t.Fatalf("got %s", db.GetRobinhoodOAuth().LastCheckStatus)
	}
}

func TestRobinhoodHealthJobUnreachableKeepsOK(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	prevTok, prevMCP := robinhood.TokenURL, robinhood.MCPEndpoint
	t.Cleanup(func() { robinhood.TokenURL, robinhood.MCPEndpoint = prevTok, prevMCP })
	robinhood.TokenURL = "http://127.0.0.1:1"
	robinhood.MCPEndpoint = "http://127.0.0.1:1"
	_ = db.SaveRobinhoodClientID("cid")
	_ = db.SaveRobinhoodTokens("A1", "R1", "Bearer", "internal", time.Now().Add(48*time.Hour).Format(time.RFC3339))
	_ = db.UpsertRobinhoodHealth("2026-08-01", live.HealthOK, "old")
	now := time.Date(2026, 9, 3, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	RunBrokerHealth(db, Deps{}, today, now)
	if db.GetRobinhoodOAuth().LastCheckStatus != live.HealthOK {
		t.Fatalf("UNREACHABLE must not overwrite OK, got %s", db.GetRobinhoodOAuth().LastCheckStatus)
	}
}

func TestBrokerHealthAlertsOnNeedsReauthOnce(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tg := &live.MemoryTelegram{}
	eng := live.New(db, nil)
	eng.Telegram = tg
	eng.ChatID = "c"
	eng.Broker = &live.MemoryBroker{}
	_ = db.SaveWebullToken("tok", time.Now().Add(-time.Hour).Format(time.RFC3339), "EXPIRED")
	now := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	RunBrokerHealth(db, Deps{Live: eng}, today, now)
	n := 0
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "переавторизация") || strings.Contains(m[1], "истекает") {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("want 1 alert, got %d %+v", n, tg.Sent())
	}
	tg.Reset()
	RunBrokerHealth(db, Deps{Live: eng}, today, now)
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "переавторизация") || strings.Contains(m[1], "истекает") {
			t.Fatalf("repeat same day: %+v", tg.Sent())
		}
	}
}
