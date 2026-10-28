package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-184: a PUT without data read the bars, then deleted and reinserted that
// snapshot, wiping a refresh that landed in between. A metadata edit must not
// touch the bars at all.
func TestDatasetPutWithoutDataLeavesBarsAlone(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{{Date: "2024-01-02", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1}}
	if err := s.DB.SaveDataset("AAA", "AAA", "Co", "old", bars, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.SQL.Exec(`CREATE TRIGGER keep_bars BEFORE DELETE ON ohlc BEGIN SELECT RAISE(ABORT, 'bars rewritten'); END`); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("PUT", "/api/datasets/AAA", strings.NewReader(`{"tag":"new"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("put %d %s", rec.Code, rec.Body.String())
	}
	ds, _ := s.DB.GetDataset("AAA")
	if strPtr(ds.Tag) != "new" || strPtr(ds.CompanyName) != "Co" {
		t.Fatalf("metadata = %v / %v", ds.Tag, ds.CompanyName)
	}

	req = httptest.NewRequest("PUT", "/api/datasets/AAA", strings.NewReader(`{"adjustedForSplits":true}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("a price claim without prices must be refused: %d %s", rec.Code, rec.Body.String())
	}
}
