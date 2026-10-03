package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-140: a PUT of one tag on an adjusted dataset marked a pending split as
// applied, so the backtest never divided the prices by it.
func TestDatasetPutKeepsPendingSplit(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{
		{Date: "2024-01-02", Open: 100, High: 110, Low: 90, Close: 100},
		{Date: "2024-01-03", Open: 50, High: 55, Low: 45, Close: 50},
	}
	if err := s.DB.SaveDataset("AAA", "AAA", "", "", bars, true); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.UpsertSplits("AAA", []types.SplitEvent{{Date: "2024-01-03", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("PUT", "/api/datasets/AAA", strings.NewReader(`{"tag":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("put %d %s", rec.Code, rec.Body.String())
	}
	pending, err := s.DB.ListPendingSplits("AAA")
	if err != nil || len(pending) != 1 {
		t.Fatalf("pending = %v, %v", pending, err)
	}
}
