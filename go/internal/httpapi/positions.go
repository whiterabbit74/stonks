package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func includeHiddenTrades(r *http.Request) bool {
	v := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("includeHidden")))
	return v == "1" || v == "true" || v == "yes"
}

func filterHiddenTrades(list []map[string]any, includeHidden bool) []map[string]any {
	if includeHidden || list == nil {
		return list
	}
	out := make([]map[string]any, 0, len(list))
	for _, t := range list {
		hidden, _ := t["isHidden"].(bool)
		if hidden {
			continue
		}
		out = append(out, t)
	}
	return out
}

// filterPositions drops what the strategy view must not show: hidden rows, and
// test buys. A test buy is a real order at the broker, so it stays in the
// journal — but it is not a strategy trade, and the monitoring page and the
// statistics are about the strategy.
func filterPositions(list []store.Position, includeHidden, includeTest bool) []store.Position {
	out := make([]store.Position, 0, len(list))
	for _, p := range list {
		if p.IsHidden && !includeHidden {
			continue
		}
		if p.IsTest && !includeTest {
			continue
		}
		out = append(out, p)
	}
	return out
}

func (s *Server) handleListPositions(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListPositions()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	list = filterPositions(list, includeHiddenTrades(r), r.URL.Query().Get("includeTest") == "1")
	writeJSON(w, 200, map[string]any{"positions": list, "total": len(list)})
}

func (s *Server) handlePostPosition(w http.ResponseWriter, r *http.Request) {
	var body store.Position
	if !s.requireJSON(w, r, &body) {
		return
	}
	if err := s.DB.AddPosition(body); err != nil {
		writeJSON(w, positionErrCode(err), map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// handlePatchPosition edits a position. The body is decoded onto the stored row,
// not into an empty one: the edit forms send the handful of fields they show, so
// decoding into a zero Position and saving it wiped everything they omit — the
// ticker, the broker legs with their order ids, the decision times, and the
// status, which then defaulted back to "open" on a closed row.
// The body is read to the end before the row is: decoding it onto the row is
// what makes the edit a read-modify-write, and it has to happen inside the
// transaction that holds the row, never around a client that is still typing.
func (s *Server) handlePatchPosition(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	if !s.requireJSON(w, r, &body) {
		return
	}
	updated, err := s.DB.PatchPosition(r.PathValue("id"), func(p *store.Position) error {
		if json.Unmarshal(body, p) != nil {
			return store.ValidationError("invalid json")
		}
		return nil
	})
	switch {
	case err != nil:
		writeJSON(w, positionErrCode(err), map[string]any{"error": err.Error()})
	case updated == nil:
		writeJSON(w, 404, map[string]any{"error": "Позиция не найдена"})
	default:
		writeJSON(w, 200, map[string]any{"ok": true})
	}
}

// positionErrCode is 400 for a row the journal rules refuse, 500 otherwise.
func positionErrCode(err error) int {
	var invalid store.ValidationError
	if errors.As(err, &invalid) {
		return 400
	}
	return 500
}

// handleClosePosition closes a position by hand. There is no linked-row check
// left to make: closing one row cannot leave another half-closed.
func (s *Server) handleClosePosition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ExitPrice float64  `json:"exitPrice"`
		ExitDate  string   `json:"exitDate"`
		ExitIBS   *float64 `json:"exitIBS"`
		Notes     string   `json:"notes"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	if !(body.ExitPrice > 0) {
		writeJSON(w, 400, map[string]any{"error": "exitPrice must be a positive number"})
		return
	}
	if body.ExitDate == "" {
		body.ExitDate = tradingdate.TodayNYSE(time.Now())
	}
	if !tradingdate.IsValid(body.ExitDate) {
		writeJSON(w, 400, map[string]any{"error": "Дата должна быть в формате ГГГГ-ММ-ДД"})
		return
	}
	updated, err := s.DB.ClosePosition(r.PathValue("id"), store.PositionExit{
		Date: body.ExitDate, Price: body.ExitPrice, IBS: body.ExitIBS, Notes: body.Notes,
	})
	if err != nil {
		code := 400
		switch err.Error() {
		case "позиция не найдена":
			code = 404
		case "позиция уже закрыта":
			code = 409
		}
		writeJSON(w, code, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, updated)
}

func (s *Server) handleDeletePosition(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeletePosition(r.PathValue("id")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
