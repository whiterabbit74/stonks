package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
)

// Refresh used to write back the tag and company it read before the provider
// fetch, undoing a metadata edit made in between (same race as AUD-184).
func TestRefreshDoesNotRewriteMetadata(t *testing.T) {
	s := testServer(t, "")
	bar := []types.OHLC{{Date: "2024-01-05", Open: 10, High: 12, Low: 9, Close: 11, Volume: 100}}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "Apple", "core", bar, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.SQL.Exec(`CREATE TRIGGER keep_meta BEFORE UPDATE OF tag, company_name ON dataset_meta BEGIN SELECT RAISE(ABORT, 'metadata rewritten'); END`); err != nil {
		t.Fatal(err)
	}
	av := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"Time Series (Daily)":{"2024-01-08":{"1. open":"11","2. high":"13","3. low":"10","4. close":"12","6. volume":"110"}}}`))
	}))
	t.Cleanup(av.Close)
	s.Providers = &providers.Client{HTTP: av.Client(), AlphaKey: "k", AlphaBase: av.URL}
	st := s.DB.Settings()
	st["resultsRefreshProvider"] = "alpha_vantage"
	if err := s.DB.SaveSettings(st); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest("POST", "/api/datasets/AAPL/refresh", nil))
	if rec.Code != 200 {
		t.Fatalf("refresh %d %s", rec.Code, rec.Body.String())
	}
	ds, _ := s.DB.GetDataset("AAPL")
	if len(ds.Data) != 2 || *ds.Tag != "core" || *ds.CompanyName != "Apple" {
		t.Fatalf("bars %d tag %v company %v", len(ds.Data), *ds.Tag, *ds.CompanyName)
	}
}
