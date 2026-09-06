package store

import (
	"strings"
	"testing"
)

// AUD-016: an unparseable settings blob was read as "nothing stored", so the
// next SetSettingsKeys merged its keys onto an empty map and saved thresholds,
// broker flags and the autoTrading state away.
func TestAUD016CorruptSettingsAreNotOverwritten(t *testing.T) {
	d := openTestDB(t)
	if err := d.SaveSettings(map[string]any{"watchThresholdPct": 1.5}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.SQL.Exec(`UPDATE settings SET data = ? WHERE id = 1`, `{"watchThresholdPct":1.5`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.SettingsErr(); err == nil {
		t.Fatal("an unparseable settings blob must not read as the defaults")
	}
	if err := d.SetSettingsKeys(map[string]any{"lastCalendarImportDate": "2026-09-06"}); err == nil {
		t.Fatal("an unparseable settings blob must not be overwritten")
	}
	var data string
	if err := d.SQL.QueryRow(`SELECT data FROM settings WHERE id = 1`).Scan(&data); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(data, "1.5") {
		t.Fatalf("stored settings were overwritten from an unparseable read: %s", data)
	}
}
