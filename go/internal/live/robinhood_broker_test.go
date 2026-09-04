package live

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"mktorder.com/go/internal/robinhood"
)

var uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func mcpAccountsServer(t *testing.T, tools *[]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			params, _ := msg["params"].(map[string]any)
			name, _ := params["name"].(string)
			*tools = append(*tools, name)
			args, _ := params["arguments"].(map[string]any)
			switch name {
			case "get_accounts":
				_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{
					"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}},
				}})
			case "get_equity_tradability", "review_equity_order":
				_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{"ok": true}})
			case "place_equity_order":
				ref, _ := args["ref_id"].(string)
				_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{"state": "filled", "ref_id": ref}})
			default:
				_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": map[string]any{}})
			}
		default:
			w.WriteHeader(400)
		}
	}))
}

func TestNewRobinhoodBrokerUsesServiceCallTool(t *testing.T) {
	var tools []string
	srv := mcpAccountsServer(t, &tools)
	t.Cleanup(srv.Close)
	svc := &robinhood.Service{HTTP: srv.Client()}
	svc.MCP = &robinhood.MCP{HTTP: srv.Client(), Endpoint: srv.URL, Token: func() (string, error) { return "tok", nil }}
	b := NewRobinhoodBroker(svc)
	if b.Call != nil {
		t.Fatal("production constructor must leave Call nil")
	}
	_, err := b.PlaceMarket("AAPL", "BUY", 1)
	if err != nil {
		t.Fatal(err)
	}
	sawAccounts := false
	for _, n := range tools {
		if n == "get_accounts" {
			sawAccounts = true
		}
	}
	if !sawAccounts {
		t.Fatalf("NewRobinhoodBroker must call Service.CallTool, tools=%v", tools)
	}
}

func TestPlaceMarketEmptyCfgSendsUUIDReusedOnRetry(t *testing.T) {
	var refs []string
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		if name == "place_equity_order" {
			refs = append(refs, fmtString(args["ref_id"]))
		}
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}}})
		case "get_equity_tradability", "review_equity_order":
			return json.Marshal(map[string]any{"ok": true})
		case "place_equity_order":
			return json.Marshal(map[string]any{"state": "queued", "ref_id": args["ref_id"]})
		default:
			return json.Marshal(map[string]any{})
		}
	}}
	if _, err := b.PlaceMarket("AAPL", "BUY", 1); err != nil {
		t.Fatal(err)
	}
	if _, err := b.PlaceMarket("AAPL", "BUY", 1); err != nil {
		t.Fatal(err)
	}
	if len(refs) != 2 {
		t.Fatalf("places %v", refs)
	}
	if !uuidRE.MatchString(refs[0]) {
		t.Fatalf("ref_id is not a UUID: %q", refs[0])
	}
	if refs[0] != refs[1] {
		t.Fatalf("retry must reuse ref_id: %q vs %q", refs[0], refs[1])
	}
}

func fmtString(v any) string {
	s, _ := v.(string)
	return s
}

func TestRobinhoodPlaceMarketIntegerQtyAndSameRef(t *testing.T) {
	var calls []map[string]any
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		calls = append(calls, map[string]any{"name": name, "args": args})
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}}})
		case "get_equity_tradability", "review_equity_order":
			return json.Marshal(map[string]any{"ok": true})
		case "place_equity_order":
			return json.Marshal(map[string]any{"state": "filled", "ref_id": args["ref_id"]})
		default:
			return json.Marshal(map[string]any{})
		}
	}}
	ref := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	res, err := b.PlaceMarketCfg("AAPL", "BUY", 12.9, PlaceMarketCfg{ClientOrderID: ref})
	if err != nil || !res.Submitted {
		t.Fatalf("%v %+v", err, res)
	}
	var place map[string]any
	for _, c := range calls {
		if c["name"] == "place_equity_order" {
			place = c["args"].(map[string]any)
		}
	}
	if place["quantity"] != "12" || place["time_in_force"] != "gfd" || place["market_hours"] != "regular_hours" {
		t.Fatalf("%v", place)
	}
	if place["type"] != "market" {
		t.Fatalf("type %v", place["type"])
	}
	want := asUUID(ref)
	if place["ref_id"] != want {
		t.Fatalf("ref %v want %v", place["ref_id"], want)
	}
	calls = nil
	_, _ = b.PlaceMarketCfg("AAPL", "BUY", 1, PlaceMarketCfg{ClientOrderID: ref})
	for _, c := range calls {
		if c["name"] == "place_equity_order" {
			if c["args"].(map[string]any)["ref_id"] != want {
				t.Fatal("ref_id must be reused")
			}
		}
	}
}

func TestRobinhoodRefusesNonAgentic(t *testing.T) {
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"X","agentic_allowed":false}]}`}}})
	}}
	_, err := b.PlaceMarket("AAPL", "BUY", 1)
	if err == nil || !strings.Contains(err.Error(), "Agentic") {
		t.Fatalf("%v", err)
	}
}

func TestRobinhoodBlockingReview(t *testing.T) {
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"account_number":"RH1","agentic_allowed":true}`}}})
		case "review_equity_order":
			return json.Marshal(map[string]any{"alerts": []any{map[string]any{"blocking": true}}})
		default:
			return json.Marshal(map[string]any{"ok": true})
		}
	}}
	_, err := b.PlaceMarket("AAPL", "BUY", 1)
	if err == nil || !strings.Contains(err.Error(), "blocking") {
		t.Fatalf("%v", err)
	}
}

func TestMapRobinhoodOrderStates(t *testing.T) {
	want := map[string]string{
		"new": "working", "queued": "working", "confirmed": "working", "unconfirmed": "working",
		"partially_filled": "partially_filled", "filled": "filled",
		"cancelled": "cancelled", "rejected": "rejected", "failed": "rejected", "voided": "cancelled",
	}
	for raw, st := range want {
		if got := MapRobinhoodOrderState(raw); got != st {
			t.Fatalf("%s -> %s want %s", raw, got, st)
		}
	}
}
