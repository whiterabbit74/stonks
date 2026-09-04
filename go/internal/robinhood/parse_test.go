package robinhood

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTradingDateIsFirstTenChars(t *testing.T) {
	if d := TradingDateFromBeginsAt("2021-09-04T13:30:00Z"); d != "2021-09-04" {
		t.Fatal(d)
	}
}

func TestParseHistoricalsDropsInterpolatedAndSorts(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"historicals": []any{
			map[string]any{"begins_at": "2024-01-03T00:00:00Z", "open_price": "3", "high_price": "4", "low_price": "2", "close_price": "3.5", "volume": "10", "interpolated": false},
			map[string]any{"begins_at": "2024-01-02T00:00:00Z", "open_price": "2", "high_price": "2", "low_price": "2", "close_price": "2", "volume": "1", "interpolated": true},
			map[string]any{"begins_at": "2024-01-01T05:00:00Z", "open_price": "1", "high_price": "1.5", "low_price": "0.5", "close_price": "1.2", "volume": 9},
		},
	})
	bars := ParseHistoricals(raw)
	if len(bars) != 2 {
		t.Fatalf("len %d", len(bars))
	}
	if bars[0].Date != "2024-01-01" || bars[1].Date != "2024-01-03" {
		t.Fatalf("%v %v", bars[0].Date, bars[1].Date)
	}
	if bars[0].Volume != 9 {
		t.Fatalf("volume %v", bars[0].Volume)
	}
}

func TestChunkStringsBatchesOfTen(t *testing.T) {
	in := strings.Split("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "")
	chunks := ChunkStrings(in, 10)
	if len(chunks) != 3 || len(chunks[0]) != 10 || len(chunks[2]) != 6 {
		t.Fatalf("%v", chunks)
	}
}

func TestRedactBearer(t *testing.T) {
	got := redactSecrets("Authorization Bearer abc.def-ghi leaked")
	if strings.Contains(got, "abc.def-ghi") {
		t.Fatal(got)
	}
}
