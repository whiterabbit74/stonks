package robinhood

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func TestNewRefIDIsUUID(t *testing.T) {
	id := NewRefID()
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(id) {
		t.Fatalf("%q", id)
	}
	if NewRefID() == id {
		t.Fatal("ids must differ")
	}
}

func TestTradingDateIsFirstTenChars(t *testing.T) {
	if d := TradingDateFromBeginsAt("2021-09-04T13:30:00Z"); d != "2021-09-04" {
		t.Fatal(d)
	}
}

func TestParseHistoricalsSymbolDropsUnlabeledBarsUnderOtherTicker(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"symbol": "MSFT",
		"instrument": "https://api.robinhood.com/instruments/msft-uuid/",
		"historicals": []any{
			map[string]any{"begins_at": "2024-01-02T00:00:00Z", "open_price": "400", "high_price": "401", "low_price": "399", "close_price": "400.5", "volume": "2"},
			map[string]any{"begins_at": "2024-01-03T00:00:00Z", "open_price": "402", "high_price": "403", "low_price": "401", "close_price": "402", "volume": "3"},
		},
	})
	if bars := ParseHistoricalsSymbol(raw, "AAPL"); len(bars) != 0 {
		t.Fatalf("MSFT parent + unlabeled bars must not become AAPL, got %d %+v", len(bars), bars)
	}
	if bars := ParseHistoricalsSymbol(raw, "MSFT"); len(bars) != 2 {
		t.Fatalf("same-ticker parent must keep unlabeled bars, got %d", len(bars))
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
