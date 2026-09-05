package live

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"mktorder.com/go/internal/robinhood"
	"mktorder.com/go/internal/store"
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

func TestPlaceMarketEmptyCfgNewUUIDEachOrder(t *testing.T) {
	var refs []string
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		if name == "place_equity_order" {
			refs = append(refs, fmtString(args["ref_id"]))
		}
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}}})
		case "get_equity_positions":
			return json.Marshal(map[string]any{"results": []any{map[string]any{"symbol": "AAPL", "quantity": 1.0, "market_value": 10.0}}})
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
	if _, err := b.PlaceMarket("AAPL", "SELL", 1); err != nil {
		t.Fatal(err)
	}
	if _, err := b.CloseMarket("AAPL"); err != nil {
		t.Fatal(err)
	}
	if len(refs) != 3 {
		t.Fatalf("places %v", refs)
	}
	for i, id := range refs {
		if !uuidRE.MatchString(id) {
			t.Fatalf("ref[%d] is not a UUID: %q", i, id)
		}
	}
	if refs[0] == refs[1] || refs[0] == refs[2] || refs[1] == refs[2] {
		t.Fatalf("distinct PlaceMarket/CloseMarket must not share ref_id: %v", refs)
	}
	same := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	refs = nil
	if _, err := b.PlaceMarketCfg("AAPL", "BUY", 1, PlaceMarketCfg{ClientOrderID: same}); err != nil {
		t.Fatal(err)
	}
	if _, err := b.PlaceMarketCfg("AAPL", "BUY", 1, PlaceMarketCfg{ClientOrderID: same}); err != nil {
		t.Fatal(err)
	}
	if len(refs) != 2 || refs[0] != refs[1] || refs[0] != asUUID(same) {
		t.Fatalf("retry with the same ClientOrderID must reuse ref_id: %v", refs)
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

// TestRobinhoodPlaceMarketRejectedStateIsNotSubmitted covers P0-6: the MCP
// call succeeding is not proof the order was accepted — a rejected/cancelled
// state in the response body must not be reported as submitted.
func TestRobinhoodPlaceMarketRejectedStateIsNotSubmitted(t *testing.T) {
	var placeCalls int
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}}})
		case "get_equity_tradability", "review_equity_order":
			return json.Marshal(map[string]any{"ok": true})
		case "place_equity_order":
			placeCalls++
			return json.Marshal(map[string]any{"state": "rejected", "ref_id": args["ref_id"]})
		default:
			return json.Marshal(map[string]any{})
		}
	}}
	res, err := b.PlaceMarket("AAPL", "BUY", 1)
	if err != nil {
		t.Fatalf("a rejected order is not a transport error: %v", err)
	}
	if res.Submitted {
		t.Fatalf("rejected state must not report Submitted: %+v", res)
	}
	if res.Ambiguous {
		t.Fatalf("a recognized rejected order is not ambiguous: %+v", res)
	}
	if placeCalls != 1 {
		t.Fatalf("expected exactly one place call, got %d", placeCalls)
	}
}

// TestRobinhoodPlaceMarketUnrecognizedResponseIsAmbiguous covers P0-6: a
// place_equity_order response with no id and no state at all cannot be read
// as either success or failure, and the broker must not resend on its own.
func TestRobinhoodPlaceMarketUnrecognizedResponseIsAmbiguous(t *testing.T) {
	var placeCalls int
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		switch name {
		case "get_accounts":
			return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"RH1","agentic_allowed":true}]}`}}})
		case "get_equity_tradability", "review_equity_order":
			return json.Marshal(map[string]any{"ok": true})
		case "place_equity_order":
			placeCalls++
			return json.Marshal(map[string]any{})
		default:
			return json.Marshal(map[string]any{})
		}
	}}
	res, err := b.PlaceMarket("AAPL", "BUY", 1)
	if err != nil {
		t.Fatalf("an unrecognized body is not itself a transport error: %v", err)
	}
	if res.Submitted {
		t.Fatalf("unrecognized response must not report Submitted: %+v", res)
	}
	if !res.Ambiguous {
		t.Fatalf("unrecognized response must be Ambiguous: %+v", res)
	}
	if placeCalls != 1 {
		t.Fatalf("ambiguous result must not trigger a resend from the broker, place calls=%d", placeCalls)
	}
}

// TestRobinhoodBrokerUsesStoredAccountNumber covers AU-P2-2: a process restart
// must reuse robinhood_oauth.account_number instead of spending a T-1 round-trip
// on get_accounts.
func TestRobinhoodBrokerUsesStoredAccountNumber(t *testing.T) {
	var tools []string
	srv := mcpAccountsServer(t, &tools)
	t.Cleanup(srv.Close)
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SaveRobinhoodClientID("cid"); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveRobinhoodAccount("RH-STORED"); err != nil {
		t.Fatal(err)
	}
	svc := &robinhood.Service{HTTP: srv.Client(), DB: db}
	svc.MCP = &robinhood.MCP{HTTP: srv.Client(), Endpoint: srv.URL, Token: func() (string, error) { return "tok", nil }}
	b := NewRobinhoodBroker(svc)
	if _, err := b.PlaceMarket("AAPL", "BUY", 1); err != nil {
		t.Fatal(err)
	}
	if b.account != "RH-STORED" {
		t.Fatalf("stored account_number must be used, account=%q", b.account)
	}
	for _, n := range tools {
		if n == "get_accounts" {
			t.Fatalf("stored account_number must skip get_accounts, tools=%v", tools)
		}
	}
}

// TestRobinhoodCancelOrderRejectsNonUUID covers AU-P2-3: CancelOrder must not
// forward a non-UUID (a future ref_id) as MCP order_id.
func TestRobinhoodCancelOrderRejectsNonUUID(t *testing.T) {
	var calls int
	b := &RobinhoodBroker{Call: func(name string, args map[string]any) (json.RawMessage, error) {
		calls++
		return json.Marshal(map[string]any{})
	}}
	err := b.CancelOrder("not-a-uuid")
	if err == nil {
		t.Fatal("expected error for non-UUID order_id")
	}
	if calls != 0 {
		t.Fatalf("CancelOrder must not Call for a non-UUID, calls=%d", calls)
	}
}

// TestResetAccountClearsCachedAccount is P-11/B-11: ?refresh=1 must drop the
// in-memory Agentic Account so the next agenticAccount() re-fetches.
func TestResetAccountClearsCachedAccount(t *testing.T) {
	var accounts int
	b := &RobinhoodBroker{
		account: "OLD",
		Call: func(name string, args map[string]any) (json.RawMessage, error) {
			if name == "get_accounts" {
				accounts++
				return json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"accounts":[{"account_number":"NEW","agentic_allowed":true}]}`}}})
			}
			return json.Marshal(map[string]any{})
		},
	}
	got, err := b.agenticAccount()
	if err != nil || got != "OLD" {
		t.Fatalf("cached account should be used, got %q %v", got, err)
	}
	if accounts != 0 {
		t.Fatalf("cached path must not call get_accounts, calls=%d", accounts)
	}
	b.ResetAccount()
	if b.account != "" {
		t.Fatalf("ResetAccount must clear cached account, got %q", b.account)
	}
	got, err = b.agenticAccount()
	if err != nil || got != "NEW" {
		t.Fatalf("after reset want NEW, got %q %v", got, err)
	}
	if accounts != 1 {
		t.Fatalf("get_accounts after reset: %d", accounts)
	}
}

func TestRobinhoodBrokerImplementsCtxReadExtensions(t *testing.T) {
	var b *RobinhoodBroker
	var _ ctxPositioner = b
	var _ ctxOrderDetailer = b
	var _ ctxOpenOrderser = b
	var _ ctxAccounter = b
}

type rhCtxKey struct{}

func TestRobinhoodAccountCtxPassesContextToTool(t *testing.T) {
	want := context.WithValue(context.Background(), rhCtxKey{}, "account")
	var got context.Context
	var tool string
	b := &RobinhoodBroker{
		account: "RH1",
		CallCtx: func(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
			got = ctx
			tool = name
			return json.Marshal(map[string]any{"cash": 1000.0, "buying_power": 1000.0, "equity": 1000.0})
		},
	}
	if _, err := b.AccountCtx(want); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("AccountCtx must pass ctx into tool, got %v", got)
	}
	if tool != "get_portfolio" {
		t.Fatalf("tool %q", tool)
	}
}

func TestRobinhoodPositionsCtxPassesContextToTool(t *testing.T) {
	want := context.WithValue(context.Background(), rhCtxKey{}, "positions")
	var got context.Context
	var tool string
	b := &RobinhoodBroker{
		account: "RH1",
		CallCtx: func(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
			got = ctx
			tool = name
			return json.Marshal(map[string]any{"results": []any{}})
		},
	}
	if _, err := b.PositionsCtx(want); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("PositionsCtx must pass ctx into tool, got %v", got)
	}
	if tool != "get_equity_positions" {
		t.Fatalf("tool %q", tool)
	}
}

func TestRobinhoodPositionsCtxPassesContextToGetAccounts(t *testing.T) {
	want := context.WithValue(context.Background(), rhCtxKey{}, "accounts")
	var gotAccounts context.Context
	b := &RobinhoodBroker{
		CallCtx: func(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
			if name == "get_accounts" {
				gotAccounts = ctx
				return json.Marshal(map[string]any{
					"accounts": []any{map[string]any{"account_number": "RH1", "agentic_allowed": true}},
				})
			}
			return json.Marshal(map[string]any{"results": []any{}})
		},
	}
	if _, err := b.PositionsCtx(want); err != nil {
		t.Fatal(err)
	}
	if gotAccounts != want {
		t.Fatalf("get_accounts must receive PositionsCtx ctx, got %v", gotAccounts)
	}
}

func TestRobinhoodOrderHistoryFiltersByDateRange(t *testing.T) {
	var gte any
	b := &RobinhoodBroker{
		account: "RH1",
		Call: func(name string, args map[string]any) (json.RawMessage, error) {
			if name == "get_equity_orders" {
				gte = args["created_at_gte"]
				return json.Marshal(map[string]any{"orders": []any{
					map[string]any{"id": "july", "created_at": "2026-07-01T16:00:00Z", "state": "filled"},
					map[string]any{"id": "aug", "created_at": "2026-08-15T16:00:00Z", "state": "filled"},
					map[string]any{"id": "sep", "created_at": "2026-09-01T16:00:00Z", "state": "filled"},
				}})
			}
			return json.Marshal(map[string]any{})
		},
	}
	got, err := b.OrderHistory("2026-08-01", "2026-08-31")
	if err != nil {
		t.Fatal(err)
	}
	if gte != "2026-08-01" {
		t.Fatalf("created_at_gte=%v want 2026-08-01", gte)
	}
	ids := map[string]bool{}
	for _, row := range got {
		m, _ := row.(map[string]any)
		ids[fmtString(m["id"])] = true
	}
	if ids["july"] {
		t.Fatalf("OrderHistory must drop 2026-07-01: %+v", got)
	}
	if !ids["aug"] {
		t.Fatalf("OrderHistory must keep 2026-08-15: %+v", got)
	}
	if ids["sep"] {
		t.Fatalf("OrderHistory must drop 2026-09-01: %+v", got)
	}
}
