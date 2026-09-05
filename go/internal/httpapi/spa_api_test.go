package httpapi

// Named spa_api_test.go rather than api_js_test.go: Go's filename rules treat
// *_js_test.go as GOOS=js, so that name never compiled on darwin/linux.

import (
	"strings"
	"testing"
)

func apiJSReq(src string) string {
	start := strings.Index(src, "async req(")
	if start < 0 {
		return ""
	}
	endRel := strings.Index(src[start:], "\n  get:")
	if endRel < 0 {
		return src[start:]
	}
	return src[start : start+endRel]
}

// TestAPIJSSkipsJSONContentTypeOnGET is AU-P3-11: fetch must not stamp
// Content-Type: application/json on GET/HEAD, which have no body.
func TestAPIJSSkipsJSONContentTypeOnGET(t *testing.T) {
	src := readWeb(t, "js/api.js")
	req := apiJSReq(src)
	if req == "" {
		t.Fatal("API.req not found")
	}
	if strings.Contains(req, "headers: { 'Content-Type': 'application/json'") ||
		strings.Contains(req, `headers: { "Content-Type": "application/json"`) {
		t.Fatal("Content-Type application/json must not be set on every fetch")
	}
	if !strings.Contains(req, "'Content-Type'") && !strings.Contains(req, `"Content-Type"`) {
		t.Fatal("POST/PUT/PATCH still need Content-Type application/json")
	}
	if !strings.Contains(req, "application/json") {
		t.Fatal("JSON Content-Type must still be used for methods with a body")
	}
	hasGET := strings.Contains(req, "'GET'") || strings.Contains(req, `"GET"`)
	hasHEAD := strings.Contains(req, "'HEAD'") || strings.Contains(req, `"HEAD"`)
	if !hasGET || !hasHEAD {
		t.Fatal("req must check method and skip Content-Type on GET/HEAD")
	}
}

// TestAPIJSUnauthorizedDebouncesByTimestamp is AU-P3-13: a boolean cleared by
// an 800ms timer can stick true (throttled tab) and drop a later 401 redirect.
// Debounce by comparing Date.now() to the last fire instead.
func TestAPIJSUnauthorizedDebouncesByTimestamp(t *testing.T) {
	src := readWeb(t, "js/api.js")
	if strings.Contains(src, "_unauthorizedFired") {
		t.Fatal("_unauthorizedFired timer-boolean must be gone")
	}
	req := apiJSReq(src)
	if req == "" {
		t.Fatal("API.req not found")
	}
	unauth := req
	if i := strings.Index(req, "session_expired"); i >= 0 {
		unauth = req[i:]
	}
	if strings.Contains(unauth, "setTimeout") {
		t.Fatal("401 debounce must not reset a boolean with setTimeout")
	}
	if !strings.Contains(req, "Date.now()") {
		t.Fatal("401 debounce must compare timestamps (Date.now)")
	}
	if !strings.Contains(req, "800") {
		t.Fatal("401 debounce window must remain 800ms")
	}
	if !strings.Contains(req, "_onUnauthorized") {
		t.Fatal("401 must still call onUnauthorized")
	}
	if !strings.Contains(src, "_lastUnauthorizedAt") {
		t.Fatal("401 debounce must store last-fired timestamp")
	}
	if !strings.Contains(req, "session_expired") {
		t.Fatal("bare 401 must not call _onUnauthorized; require code === 'session_expired'")
	}
}

func TestAPIBrokerTradesPassesKindQuery(t *testing.T) {
	src := readWeb(t, "js/api.js")
	if !strings.Contains(src, "brokerTrades:") {
		t.Fatal("API.brokerTrades missing")
	}
	start := strings.Index(src, "brokerTrades:")
	end := strings.Index(src[start:], "\n  autoConfig")
	if end < 0 {
		t.Fatal("API.brokerTrades not bounded")
	}
	fn := src[start : start+end]
	if !strings.Contains(fn, "?broker=") {
		t.Fatal("API.brokerTrades(kind) must pass ?broker=")
	}
}
