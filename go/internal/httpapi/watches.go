package httpapi

import (
	"errors"
	"net/http"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
)

// handleWatches returns the watchlist with each ticker's open monitoring
// position read from the journal at request time. The journal is the only
// place a position lives: an unreadable journal is an error, not "nothing open".
func (s *Server) handleWatches(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListWatches()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	open, err := s.DB.OpenPositions()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	bySym := map[string]store.Position{}
	for _, p := range open { // newest first: the first one per ticker wins
		if _, seen := bySym[p.Symbol]; !seen && !p.IsTest && !p.IsHidden {
			bySym[p.Symbol] = p
		}
	}
	for _, wt := range list {
		p, ok := bySym[wt["symbol"].(string)]
		wt["isOpenPosition"] = ok
		wt["entryPrice"], wt["entryDate"], wt["entryIBS"], wt["entryDecisionTime"], wt["currentTradeId"] = nil, nil, nil, nil, nil
		if !ok {
			continue
		}
		price := p.EntryPrice // the signal price; a broker fill when there is none
		for _, leg := range []store.BrokerLeg{p.Webull, p.Robinhood} {
			if price == nil {
				price = leg.EntryPrice
			}
		}
		wt["entryPrice"], wt["entryDate"], wt["entryIBS"] = price, p.EntryDate, p.EntryIBS
		wt["entryDecisionTime"], wt["currentTradeId"] = p.EntryDecisionTime, p.ID
	}
	writeJSON(w, 200, list)
}

func watchHasThresholdKey(body map[string]any) bool {
	if body == nil {
		return false
	}
	_, hasLow := body["lowIBS"]
	_, hasHigh := body["highIBS"]
	return hasLow || hasHigh
}

func findWatch(list []map[string]any, symbol string) map[string]any {
	want := store.SafeTicker(symbol)
	if want == "" {
		return nil
	}
	for _, w := range list {
		s, _ := w["symbol"].(string)
		if s == want {
			return w
		}
	}
	return nil
}

func (s *Server) existingWatch(symbol string) map[string]any {
	list, err := s.DB.ListWatches()
	if err != nil {
		return nil
	}
	return findWatch(list, symbol)
}

func watchBodySymbol(body map[string]any) string {
	s, _ := body["symbol"].(string)
	return s
}

func validateWatchThresholds(body, existing map[string]any) error {
	if !watchHasThresholdKey(body) {
		return nil
	}
	low := ibs.DefaultLowIBS
	high := ibs.DefaultHighIBS
	if existing != nil {
		if f, ok := existing["lowIBS"].(float64); ok {
			low = f
		}
		if f, ok := existing["highIBS"].(float64); ok {
			high = f
		}
	}
	// The store parses a threshold with asFloat, which also reads strings, so
	// skipping a non-float64 value here let `"lowIBS": "0.9"` pass validation
	// and still be saved (AUD-042). A threshold that is present must be a
	// JSON number.
	for _, key := range []string{"lowIBS", "highIBS"} {
		v, ok := body[key]
		if !ok || v == nil {
			continue
		}
		f, ok := v.(float64)
		if !ok {
			return errors.New(key + " must be a number")
		}
		if key == "lowIBS" {
			low = f
		} else {
			high = f
		}
	}
	_, _, err := ibs.SanitizeThresholds(low, high)
	return err
}

func (s *Server) handleWatchPost(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if !s.requireJSON(w, r, &body) {
		return
	}
	if err := validateWatchThresholds(body, s.existingWatch(watchBodySymbol(body))); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := s.DB.UpsertWatch(body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWatchDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeleteWatch(r.PathValue("symbol")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWatchPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if !s.requireJSON(w, r, &body) {
		return
	}
	symbol := r.PathValue("symbol")
	if watchHasThresholdKey(body) {
		list, err := s.DB.ListWatches()
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		if existing := findWatch(list, symbol); existing != nil {
			if err := validateWatchThresholds(body, existing); err != nil {
				writeJSON(w, 400, map[string]any{"error": err.Error()})
				return
			}
		}
	}
	if err := s.DB.PatchWatch(symbol, body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleEMAAlerts(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListEMAAlerts()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) handleEMAAlertPost(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if !s.requireJSON(w, r, &body) {
		return
	}
	id, err := s.DB.UpsertEMAAlert(body)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	row, gerr := s.DB.GetEMAAlert(id)
	if gerr != nil {
		writeJSON(w, 500, map[string]any{"error": gerr.Error()})
		return
	}
	if row != nil {
		writeJSON(w, 200, row)
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "symbol": body["symbol"]})
}

func (s *Server) handleEMAAlertPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if !s.requireJSON(w, r, &body) {
		return
	}
	// Кнопки шлют один ключ ({enabled} или {nextAction}): накладываем его на
	// сохранённую строку, иначе Upsert достроит тикер NIL и уровни по умолчанию.
	saved, gerr := s.DB.GetEMAAlert(r.PathValue("id"))
	if gerr != nil {
		writeJSON(w, 500, map[string]any{"error": gerr.Error()})
		return
	}
	if saved == nil {
		writeJSON(w, 404, map[string]any{"error": "EMA alert not found"})
		return
	}
	if _, ok := body["nextAction"]; ok {
		// levelPct/direction выводятся из nextAction, если их не прислали.
		delete(saved, "levelPct")
		delete(saved, "direction")
	}
	for k, v := range body {
		saved[k] = v
	}
	saved["id"] = r.PathValue("id")
	id, err := s.DB.UpsertEMAAlert(saved)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	row, gerr := s.DB.GetEMAAlert(id)
	if gerr != nil {
		writeJSON(w, 500, map[string]any{"error": gerr.Error()})
		return
	}
	if row != nil {
		writeJSON(w, 200, row)
		return
	}
	writeJSON(w, 404, map[string]any{"error": "EMA alert not found"})
}

func (s *Server) handleEMAAlertDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeleteEMAAlert(r.PathValue("id")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
