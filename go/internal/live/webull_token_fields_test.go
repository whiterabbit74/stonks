package live

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestWebullTokenExpiryAliases(t *testing.T) {
	cases := map[string]string{
		`{"tokenExpireTime":"2021-02-14T13:35:35.780+0000"}`: "2021-02-14T13:35:35Z",
		`{"data":{"expireTime":"2026-09-20T04:00:00Z"}}`:     "2026-09-20T04:00:00Z",
		`{"expiration_time":1789430400000}`:                  "2026-09-15T00:00:00Z",
		`{"expires":1789430400}`:                             "2026-09-15T00:00:00Z",
		`{"expires_at":"1789430400"}`:                        "2026-09-15T00:00:00Z",
		`{"status":"NORMAL"}`:                                "",
	}
	for raw, want := range cases {
		var m map[string]any
		if err := json.Unmarshal([]byte(raw), &m); err != nil {
			t.Fatal(err)
		}
		if got := webullTokenExpiry(m); got != want {
			t.Fatalf("%s -> %q, want %q", raw, got, want)
		}
	}
}

func TestWebullTokenValueAndStatusAliases(t *testing.T) {
	var m map[string]any
	if err := json.Unmarshal([]byte(`{"data":{"accessToken":"tok","tokenStatus":"PENDING"}}`), &m); err != nil {
		t.Fatal(err)
	}
	if got := webullTokenValue(m); got != "tok" {
		t.Fatalf("token = %q", got)
	}
	// A status read as "" defaults to NORMAL at the call sites, so missing the
	// alias would promote an unverified token to healthy.
	if got := webullTokenStatus(m); got != "PENDING" {
		t.Fatalf("status = %q", got)
	}
}

func TestLogUnknownExpiryNamesResponseKeys(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	if err := e.DB.SaveWebullToken("tok", "", "NORMAL"); err != nil {
		t.Fatal(err)
	}
	e.logUnknownExpiry(map[string]any{"status": "NORMAL", "data": map[string]any{"deadline": "x"}})
	logs, err := e.DB.ListAutotradeLogsKind("webull", 10)
	if err != nil {
		t.Fatal(err)
	}
	msg := ""
	if len(logs) > 0 {
		msg, _ = logs[0]["message"].(string)
	}
	if !strings.Contains(msg, "data.deadline") || !strings.Contains(msg, "status") {
		t.Fatalf("logs = %v", logs)
	}

	// Nothing to diagnose once a deadline is known.
	if err := e.DB.SaveWebullToken("tok", "2026-12-01T00:00:00Z", "NORMAL"); err != nil {
		t.Fatal(err)
	}
	e.logUnknownExpiry(map[string]any{"status": "NORMAL"})
	if again, _ := e.DB.ListAutotradeLogsKind("webull", 10); len(again) != len(logs) {
		t.Fatalf("logged with a known expiry: %v", again)
	}
}
