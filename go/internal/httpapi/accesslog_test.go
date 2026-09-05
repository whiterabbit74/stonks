package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAccessLogWritesRedactedJSONL(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HTTP_LOG_PATH", filepath.Join(dir, "http-access.jsonl"))
	t.Cleanup(resetHTTPLogForTest)

	s := testServer(t, "")
	body, _ := json.Marshal(map[string]any{"username": "admin@example.com", "password": "super-secret-pass"})
	req := httptest.NewRequest("POST", "/api/login?token=SECRETTOKEN", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.1.2.3:4444"
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	resetHTTPLogForTest()
	raw, err := os.ReadFile(httpLogPathFor(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	line := string(raw)
	if !strings.Contains(line, `"path":"/api/login"`) {
		t.Fatalf("missing path: %s", line)
	}
	if !strings.Contains(line, `"method":"POST"`) {
		t.Fatalf("missing method: %s", line)
	}
	if strings.Contains(line, "super-secret-pass") {
		t.Fatalf("password leaked: %s", line)
	}
	if strings.Contains(line, "SECRETTOKEN") {
		t.Fatalf("query token leaked: %s", line)
	}
	if !strings.Contains(line, "[redacted]") {
		t.Fatalf("expected redacted marker: %s", line)
	}
	if !strings.Contains(line, "10.1.2.3") {
		t.Fatalf("missing ip: %s", line)
	}
}

func TestAccessLogSkipsStaticAndCapturesStatus(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HTTP_LOG_PATH", filepath.Join(dir, "http-access.jsonl"))
	t.Cleanup(resetHTTPLogForTest)

	s := testServer(t, "")
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	resetHTTPLogForTest()
	if _, err := os.Stat(httpLogPathFor(time.Now())); err == nil {
		t.Fatal("static / must not write an API access log")
	}

	req = httptest.NewRequest("GET", "/api/does-not-exist", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	resetHTTPLogForTest()
	raw, err := os.ReadFile(httpLogPathFor(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"status":404`) && !strings.Contains(string(raw), `"status":401`) {
		t.Fatalf("wanted 404/401, got %s", raw)
	}
}

func TestAccessLogClipsPathAndQuery(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HTTP_LOG_PATH", filepath.Join(dir, "http-access.jsonl"))
	t.Cleanup(resetHTTPLogForTest)

	s := testServer(t, "")
	longPath := "/api/" + strings.Repeat("p", 300)
	longQuery := "q=" + strings.Repeat("x", 600)
	req := httptest.NewRequest("GET", longPath+"?"+longQuery, nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	resetHTTPLogForTest()
	raw, err := os.ReadFile(httpLogPathFor(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	var recJSON map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(raw), &recJSON); err != nil {
		t.Fatalf("json: %v %s", err, raw)
	}
	path, _ := recJSON["path"].(string)
	query, _ := recJSON["query"].(string)
	if len(path) > 256 {
		t.Fatalf("path not clipped: len=%d", len(path))
	}
	if len(query) > 512 {
		t.Fatalf("query not clipped: len=%d", len(query))
	}
	if len(path) < 256 {
		t.Fatalf("expected a 256-byte clipped path, got %d", len(path))
	}
	if !strings.HasPrefix(path, "/api/") {
		t.Fatalf("path prefix lost: %q", path)
	}
}

func TestRedactJSONNestedSecrets(t *testing.T) {
	got := redactJSON(map[string]any{
		"ok":     true,
		"nested": map[string]any{"access_token": "abc", "n": 1},
	}).(map[string]any)
	nested := got["nested"].(map[string]any)
	if nested["access_token"] != "[redacted]" {
		t.Fatalf("%v", nested)
	}
	if nested["n"] != 1.0 && nested["n"] != 1 {
		t.Fatalf("n %v", nested["n"])
	}
}
