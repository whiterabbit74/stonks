package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestSavePayloadDetectsAndAdjustsSplits(t *testing.T) {
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
	if body["adjustedForSplits"] != true {
		t.Fatalf("expected auto-adjust, got %v", body)
	}
	ds, _ := s.DB.GetDataset("GOOGL")
	bars := decodeBars(ds["data"])
	if bars[0].Close > 600 {
		t.Fatalf("2014 pre-split still raw: %v", bars[0].Close)
	}
	if ds["adjustedForSplits"] != true {
		t.Fatalf("flag %v", ds["adjustedForSplits"])
	}
	evs, _ := s.DB.ListSplits("GOOGL")
	if len(evs) != 1 || evs[0].Date != "2014-04-03" || evs[0].Factor != 2 {
		t.Fatalf("persisted splits %v", evs)
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

func TestGetDatasetHealsRawGOOGLCliffs(t *testing.T) {
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
	if ds["adjustedForSplits"] != true {
		t.Fatalf("flag %v", ds["adjustedForSplits"])
	}
	bars := decodeBars(ds["data"])
	if bars[0].Close > 200 {
		t.Fatalf("2022 pre-split still raw: %v", bars[0].Close)
	}
	stored, _ := s.DB.GetDataset("GOOGL")
	if stored["adjustedForSplits"] != true {
		t.Fatalf("not persisted")
	}
}
