package providers

import (
	"encoding/json"
	"testing"

	"mktorder.com/go/internal/robinhood"
)

func TestRobinhoodHistoricalsDropInterpolated(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{"historicals": []any{
		map[string]any{"begins_at": "2024-01-02T00:00:00Z", "open_price": "2", "high_price": "2", "low_price": "2", "close_price": "2", "interpolated": true},
		map[string]any{"begins_at": "2024-01-01T13:00:00Z", "open_price": "1", "high_price": "1.2", "low_price": "0.9", "close_price": "1.1", "volume": "4"},
	}})
	bars := robinhood.ParseHistoricals(raw)
	if len(bars) != 1 || bars[0].Date != "2024-01-01" {
		t.Fatalf("%+v", bars)
	}
}

func TestRobinhoodChunkTen(t *testing.T) {
	in := make([]string, 21)
	for i := range in {
		in[i] = "S"
	}
	ch := robinhood.ChunkStrings(in, 10)
	if len(ch) != 3 || len(ch[0]) != 10 || len(ch[2]) != 1 {
		t.Fatalf("%v", ch)
	}
}
