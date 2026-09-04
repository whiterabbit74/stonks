package robinhood

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMCPInitializeSessionAndToolCall(t *testing.T) {
	var sawSession bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept") != "application/json, text/event-stream" {
			t.Errorf("accept %s", r.Header.Get("Accept"))
		}
		b, _ := io.ReadAll(r.Body)
		var msg map[string]any
		_ = json.Unmarshal(b, &msg)
		method, _ := msg["method"].(string)
		switch method {
		case "initialize":
			w.Header().Set("Mcp-Session-Id", "sess-1")
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{"protocolVersion": "2025-06-18"}})
		case "notifications/initialized":
			w.WriteHeader(204)
		case "tools/call":
			if r.Header.Get("Mcp-Session-Id") != "sess-1" {
				t.Errorf("missing session")
			}
			sawSession = true
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"ok\":true}}\n\n"))
		default:
			t.Errorf("method %s", method)
			w.WriteHeader(400)
		}
	}))
	t.Cleanup(srv.Close)
	c := &MCP{HTTP: srv.Client(), Endpoint: srv.URL, Token: func() (string, error) { return "tok", nil }}
	raw, err := c.CallTool("get_accounts", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !sawSession {
		t.Fatal("tools/call without session")
	}
	if !strings.Contains(string(raw), "ok") {
		t.Fatalf("%s", raw)
	}
}
