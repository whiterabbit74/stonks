package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func (s *Server) handleApplySplits(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный идентификатор датасета"})
		return
	}
	ds, err := s.DB.GetDatasetMeta(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
		return
	}
	applied, err := s.DB.ApplyPendingSplits(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if applied == 0 {
		// Nothing left to bake in: the flag of the dataset stays as it is.
		writeJSON(w, 200, map[string]any{"success": true, "id": id, "alreadyApplied": true, "message": "Датасет уже пересчитан с учётом сплитов"})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "id": id, "message": "Датасет пересчитан с учётом сплитов"})
}

func (s *Server) handleAllSplits(w http.ResponseWriter, r *http.Request) {
	all, err := s.DB.AllSplits()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, all)
}

func (s *Server) handleGetSplits(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListSplits(r.PathValue("symbol"))
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) handlePutSplits(w http.ResponseWriter, r *http.Request) {
	symbol := store.SafeTicker(r.PathValue("symbol"))
	if symbol == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	events, err := parseSplitBody(r)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := s.DB.ReplaceSplits(symbol, events); err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось сохранить сплиты"})
		return
	}
	s.writeSplitsEcho(w, symbol)
}

func (s *Server) handlePatchSplits(w http.ResponseWriter, r *http.Request) {
	symbol := store.SafeTicker(r.PathValue("symbol"))
	if symbol == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	events, err := parseSplitBody(r)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := s.DB.UpsertSplits(symbol, events); err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось обновить сплиты"})
		return
	}
	s.writeSplitsEcho(w, symbol)
}

// writeSplitsEcho answers with the split list a write just produced. An
// unreadable table is not an empty one: echoing nil would tell the UI the
// symbol has no splits right after a successful save (AUD-020 class).
func (s *Server) writeSplitsEcho(w http.ResponseWriter, symbol string) {
	updated, err := s.DB.ListSplits(symbol)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Сплиты сохранены, но список не прочитан"})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "events": updated})
}

func parseSplitBody(r *http.Request) ([]types.SplitEvent, error) {
	var raw json.RawMessage
	if err := readJSON(r, &raw); err != nil {
		return nil, errors.New("invalid json")
	}
	var events []map[string]any
	if err := json.Unmarshal(raw, &events); err == nil {
		return toSplits(events), nil
	}
	var wrap struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.Unmarshal(raw, &wrap); err == nil && wrap.Events != nil {
		return toSplits(wrap.Events), nil
	}
	return nil, errors.New("Body must be array of {date,factor}")
}

func (s *Server) handleDeleteSplitDate(w http.ResponseWriter, r *http.Request) {
	symbol := store.SafeTicker(r.PathValue("symbol"))
	if err := s.DB.DeleteSplit(symbol, r.PathValue("date")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	s.writeSplitsEcho(w, symbol)
}

func (s *Server) handleDeleteSplits(w http.ResponseWriter, r *http.Request) {
	symbol := store.SafeTicker(r.PathValue("symbol"))
	if err := s.DB.DeleteSplits(symbol); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol})
}
