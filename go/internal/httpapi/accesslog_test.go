package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
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

func TestAccessLogOmitsDetailsOn429(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HTTP_LOG_PATH", filepath.Join(dir, "http-access.jsonl"))
	t.Cleanup(resetHTTPLogForTest)

	s := testServer(t, "secret")
	body, _ := json.Marshal(map[string]any{"username": "admin@example.com", "password": "nope"})
	var last int
	for i := 0; i < 12; i++ {
		req := httptest.NewRequest("POST", "/api/login?token=should-not-log", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "evil-scanner/1.0")
		req.RemoteAddr = "203.0.113.9:1234"
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after login burst, got %d", last)
	}
	resetHTTPLogForTest()
	raw, err := os.ReadFile(httpLogPathFor(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range bytes.Split(bytes.TrimSpace(raw), []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var recJSON map[string]any
		if err := json.Unmarshal(line, &recJSON); err != nil {
			t.Fatalf("json: %v %s", err, line)
		}
		st, _ := recJSON["status"].(float64)
		if int(st) == http.StatusTooManyRequests {
			t.Fatalf("limiter 429 must not write an access-log line: %s", line)
		}
	}
}

func TestHTTPLogRotatesBySize(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HTTP_LOG_PATH", filepath.Join(dir, "http-access.jsonl"))
	t.Cleanup(resetHTTPLogForTest)
	oldMax := httpLogMaxBytes
	httpLogMaxBytes = 400
	t.Cleanup(func() { httpLogMaxBytes = oldMax })

	line := append(bytes.Repeat([]byte("x"), 120), '\n')
	for i := 0; i < 20; i++ {
		appendHTTPLog(line)
	}
	resetHTTPLogForTest()
	ents, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(ents) > httpLogKeep+1 {
		t.Fatalf("log files %d want at most %d", len(ents), httpLogKeep+1)
	}
	if len(ents) < 2 {
		t.Fatal("size rotation must produce more than one file")
	}
	for _, e := range ents {
		fi, err := e.Info()
		if err != nil {
			t.Fatal(err)
		}
		if fi.Size() > httpLogMaxBytes {
			t.Fatalf("%s size %d exceeds limit %d", e.Name(), fi.Size(), httpLogMaxBytes)
		}
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
