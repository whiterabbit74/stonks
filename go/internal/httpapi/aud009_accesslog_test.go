package httpapi

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// AUD-009b / AUD-009c (docs/audits/REGISTRY.md): size rotation only ever
// bounded one month's files, and a log that could not be written was lost
// in silence.

func aud009Log(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "http-access.jsonl")
	t.Setenv("HTTP_LOG_PATH", path)
	resetHTTPLogForTest()
	t.Cleanup(resetHTTPLogForTest)
	return path
}

func TestHTTPLogPrunesOldMonthsAndKeepsPermissions(t *testing.T) {
	dir := t.TempDir()
	aud009Log(t, dir)

	old := httpLogPathFor(time.Now().AddDate(0, -httpLogKeepMonths-1, 0))
	recent := httpLogPathFor(time.Now().AddDate(0, -1, 0))
	for _, p := range []string{old, recent, old + ".1"} {
		if err := os.WriteFile(p, []byte("old\n"), 0o640); err != nil {
			t.Fatal(err)
		}
	}

	appendHTTPLog([]byte("{}\n"))

	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Errorf("a month past the retention window was kept: %v", err)
	}
	if _, err := os.Stat(old + ".1"); !os.IsNotExist(err) {
		t.Error("the rotated set of an expired month was kept")
	}
	if _, err := os.Stat(recent); err != nil {
		t.Errorf("a month inside the window was deleted: %v", err)
	}
	fi, err := os.Stat(httpLogPathFor(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o640 {
		t.Errorf("log mode %v, want 0640", fi.Mode().Perm())
	}
}

func TestHTTPLogSizeRotationStaysBounded(t *testing.T) {
	dir := t.TempDir()
	aud009Log(t, dir)
	prev := httpLogMaxBytes
	httpLogMaxBytes = 512
	t.Cleanup(func() { httpLogMaxBytes = prev })

	line := []byte(strings.Repeat("x", 200) + "\n")
	for i := 0; i < 30; i++ {
		appendHTTPLog(line)
	}
	names, _ := filepath.Glob(filepath.Join(dir, "*"))
	if len(names) != httpLogKeep+1 {
		t.Fatalf("want %d files (base plus %d archives), got %d: %v", httpLogKeep+1, httpLogKeep, len(names), names)
	}
}

func TestHTTPLogFailureIsCountedNotSwallowed(t *testing.T) {
	dir := t.TempDir()
	locked := filepath.Join(dir, "locked")
	if err := os.Mkdir(locked, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HTTP_LOG_PATH", filepath.Join(locked, "sub", "http-access.jsonl"))
	resetHTTPLogForTest()
	t.Cleanup(resetHTTPLogForTest)

	if HTTPLogHealth() != nil {
		t.Fatal("no failures yet, health must be nil")
	}
	// Serving continues — an unwritable access log is a lost audit trail, not
	// a reason to refuse traffic — but the loss has to be visible.
	appendHTTPLog([]byte("{}\n"))
	appendHTTPLog([]byte("{}\n"))

	h := HTTPLogHealth()
	if h == nil {
		t.Fatal("lost entries were not reported at all")
	}
	if h["lostEntries"] != 2 {
		t.Fatalf("lostEntries=%v want 2", h["lostEntries"])
	}
	if s, _ := h["lastError"].(string); s == "" {
		t.Fatal("the reason the write failed was not recorded")
	}
}
