package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestSavePayloadDoesNotAutoApplySplits(t *testing.T) {
	s := testServer(t, "")
	payload, _ := json.Marshal(map[string]any{
		"ticker": "GOOGL",
		"name":   "GOOGL",
		"data": []types.OHLC{
			{Date: "2014-04-02", Open: 1141.9, High: 1144.8, Low: 1124, Close: 1135.1, Volume: 1000},
			{Date: "2014-04-03", Open: 573.39, High: 588.3, Low: 566.01, Close: 571.5, Volume: 2000},
		},
	})
	req := httptest.NewRequest("POST", "/api/datasets", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("save %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["success"] != true {
		t.Fatalf("expected success, got %v", body)
	}
	if body["adjustedForSplits"] == true {
		t.Fatalf("POST must not auto-adjust, got %v", body)
	}
	hints, _ := body["detectedSplits"].([]any)
	if len(hints) == 0 {
		t.Fatalf("expected detectedSplits hints, got %v", body)
	}
	ds, _ := s.DB.GetDataset("GOOGL")
	bars := decodeBars(ds["data"])
	if bars[0].Close < 600 {
		t.Fatalf("2014 pre-split was mutated on save: %v", bars[0].Close)
	}
	evs, _ := s.DB.ListSplits("GOOGL")
	if len(evs) != 0 {
		t.Fatalf("guessed splits must not be persisted: %v", evs)
	}
}

func TestSavePayloadUpsertsExplicitSplits(t *testing.T) {
	s := testServer(t, "")
	payload, _ := json.Marshal(map[string]any{
		"ticker": "MSFT",
		"name":   "MSFT",
		"data": []types.OHLC{
			{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
			{Date: "2024-01-02", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
		},
		"splits": []map[string]any{{"date": "2024-01-02", "factor": 2}},
	})
	req := httptest.NewRequest("POST", "/api/datasets", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("save %d %s", rec.Code, rec.Body.String())
	}
	evs, _ := s.DB.ListSplits("MSFT")
	if len(evs) != 1 || evs[0].Date != "2024-01-02" || evs[0].Factor != 2 {
		t.Fatalf("explicit splits %v", evs)
	}
	ds, _ := s.DB.GetDataset("MSFT")
	bars := decodeBars(ds["data"])
	if bars[0].Close != 10 {
		t.Fatalf("save must not adjust prices, close=%v", bars[0].Close)
	}
}

func TestSavePayloadDoesNotDoubleAdjust(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.ReplaceSplits("GOOGL", []types.SplitEvent{{Date: "2014-04-03", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	adj := []types.OHLC{
		{Date: "2014-04-02", Open: 570.95, High: 572.4, Low: 562, Close: 567.55, Volume: 2000},
		{Date: "2014-04-03", Open: 573.39, High: 588.3, Low: 566.01, Close: 571.5, Volume: 2000},
	}
	payload, _ := json.Marshal(map[string]any{"ticker": "GOOGL", "name": "GOOGL", "data": adj})
	req := httptest.NewRequest("POST", "/api/datasets", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("save %d %s", rec.Code, rec.Body.String())
	}
	ds, _ := s.DB.GetDataset("GOOGL")
	bars := decodeBars(ds["data"])
	if bars[0].Close < 500 {
		t.Fatalf("double-adjusted close %v", bars[0].Close)
	}
	if bars[0].Close != 567.55 {
		t.Fatalf("close mutated %v", bars[0].Close)
	}
}

func TestGetDatasetDoesNotHealOrPersistSplits(t *testing.T) {
	s := testServer(t, "")
	raw := []types.OHLC{
		{Date: "2022-07-15", Open: 2240.01, High: 2262.81, Low: 2218, Close: 2235.55, Volume: 1},
		{Date: "2022-07-18", Open: 112.64, High: 113.68, Low: 108.37, Close: 109.03, Volume: 1},
	}
	if err := s.DB.SaveDataset("GOOGL", "GOOGL", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/datasets/GOOGL", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("get %d %s", rec.Code, rec.Body.String())
	}
	var ds map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ds)
	if ds["adjustedForSplits"] == true {
		t.Fatalf("GET must not set adjusted flag: %v", ds["adjustedForSplits"])
	}
	bars := decodeBars(ds["data"])
	if bars[0].Close < 200 {
		t.Fatalf("GET mutated pre-split close: %v", bars[0].Close)
	}
	hints, _ := ds["detectedSplits"].([]any)
	if len(hints) == 0 {
		t.Fatalf("expected detectedSplits hints: %v", ds)
	}
	stored, _ := s.DB.GetDataset("GOOGL")
	if stored["adjustedForSplits"] == true {
		t.Fatal("GET persisted guessed adjustment")
	}
	evs, _ := s.DB.ListSplits("GOOGL")
	if len(evs) != 0 {
		t.Fatalf("GET persisted guessed splits: %v", evs)
	}
}
