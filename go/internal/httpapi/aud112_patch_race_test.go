package httpapi

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/store"
)

// readHook runs f once, the moment the handler starts reading the request body.
type readHook struct {
	io.Reader
	f func()
}

func (r *readHook) Read(p []byte) (int, error) {
	if r.f != nil {
		f := r.f
		r.f = nil
		f()
	}
	return r.Reader.Read(p)
}

// AUD-112: правка позиции читала строку, потом писала её целиком. Исполнение,
// пришедшее между чтением и записью, терялось — PATCH одних заметок возвращал
// уже проданные акции и стирал id заявки на выход.
func TestPatchDoesNotResurrectSoldLeg(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.SavePosition(store.Position{
		ID: "p", Symbol: "AAPL", Status: "open", Quantity: 10,
		Webull: store.BrokerLeg{Qty: 10, EntryOrderID: "entry"},
	}); err != nil {
		t.Fatal(err)
	}

	body := &readHook{Reader: strings.NewReader(`{"notes":"edited"}`), f: func() {
		if _, _, err := s.DB.ExitLeg("p", "webull", 11, "exit", 10); err != nil {
			t.Error(err)
		}
	}}
	r := httptest.NewRequest("PATCH", "/api/positions/p", body)
	r.SetPathValue("id", "p")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handlePatchPosition(w, r)
	if w.Code != 200 {
		t.Fatalf("PATCH %d %s", w.Code, w.Body.String())
	}

	p, err := s.DB.GetPosition("p")
	if err != nil {
		t.Fatal(err)
	}
	if p.Webull.Qty != 0 || p.Webull.ExitOrderID != "exit" {
		t.Fatalf("исполненный выход потерян: qty=%v exitOrder=%q", p.Webull.Qty, p.Webull.ExitOrderID)
	}
	if p.Notes != "edited" {
		t.Fatalf("правка не применена: notes=%q", p.Notes)
	}
}
