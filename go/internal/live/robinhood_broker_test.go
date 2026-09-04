package live

import (
	"encoding/json"
	"strings"
	"testing"
)

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
