package providers

import (
	"encoding/json"
	"testing"
	"time"
)

// A real Webull snapshot row, taken from the production account on 2026-09-09.
// The freshness check of CORE-06 was reading keys this answer does not have, so
// AsOf stayed zero and no Webull quote was ever judged on its age (AUD-124).
const webullSnapshotSample = `{"symbol":"AAPL","price":"312.2900","open":"315.5000","high":"318.1300",
"low":"310.9700","volume":"28849958","close":"312.2900","instrument_id":"913256135",
"pre_close":"316.220000","last_trade_time":1788976132183,"quote_time":1788976132265}`

func TestWebullSnapshotCarriesItsOwnTimestamp(t *testing.T) {
	var row map[string]any
	if err := json.Unmarshal([]byte(webullSnapshotSample), &row); err != nil {
		t.Fatal(err)
	}
	got := snapshotPayload(row).AsOf
	if got.IsZero() {
		t.Fatal("a snapshot with quote_time must produce an AsOf; staleness cannot be judged without it")
	}
	// epochToTime divides through float64, so the millisecond lands with a
	// nanosecond of drift.
	if want := time.UnixMilli(1788976132265).UTC(); got.Sub(want) > time.Millisecond || want.Sub(got) > time.Millisecond {
		t.Fatalf("AsOf = %s, want %s", got, want)
	}
}

// A timestamp with no zone is not evidence: read as UTC an exchange-local stamp
// looks four hours old and would stop the chain on every answer.
func TestZonelessTimestampStaysUnknown(t *testing.T) {
	if got := quoteAsOf(map[string]any{"ts": "2026-09-09 15:59:00"}, "ts"); !got.IsZero() {
		t.Fatalf("zone-less stamp parsed as %s; must stay unknown", got)
	}
}
