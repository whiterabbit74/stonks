package providers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// AUD-153: Polygon was always asked for split-adjusted bars, so a "none"
// history the caller stores raw came back already divided.
func TestPolygonHonoursRequestedAdjustment(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.Query().Get("adjusted")
		_, _ = w.Write([]byte(`{"status":"OK","results":[{"t":1767225600000,"o":1,"h":2,"l":1,"c":2,"v":1}]}`))
	}))
	t.Cleanup(srv.Close)
	c := &Client{HTTP: srv.Client(), PolygonKey: "k", PolygonBase: srv.URL}
	for adj, want := range map[string]string{"none": "false", "split_only": "true"} {
		if _, err := c.Historical("AAPL", "polygon", 1767225600, 1767312000, adj); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("adjustment %q: adjusted=%s, want %s", adj, got, want)
		}
	}
}
