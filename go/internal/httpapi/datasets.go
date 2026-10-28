package httpapi

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func (s *Server) handleListDatasets(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListDatasets()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось получить список датасетов"})
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) handleGetDataset(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ds, err := s.DB.GetDataset(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось получить датасет"})
		return
	}
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
		return
	}
	events, err := s.DB.ListSplits(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать сплиты"})
		return
	}
	hints, err := s.detectSplitHints(id, ds.Data)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать сплиты"})
		return
	}
	writeJSON(w, 200, struct {
		*store.Dataset
		Splits         []types.SplitEvent `json:"splits"`
		DetectedSplits []types.SplitEvent `json:"detectedSplits"`
	}{ds, events, hints})
}

func (s *Server) handleDatasetMeta(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ds, err := s.DB.GetDatasetMeta(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось получить метаданные датасета"})
		return
	}
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
		return
	}
	events, err := s.DB.ListSplits(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать сплиты"})
		return
	}
	writeJSON(w, 200, struct {
		*store.DatasetMeta
		LastDate string             `json:"lastDate"`
		Splits   []types.SplitEvent `json:"splits"`
	}{ds, lastDateFromDataset(ds), events})
}

// lastDateFromDataset is the last bar's date; both bar writers keep date_to.
func lastDateFromDataset(ds *store.DatasetMeta) string {
	if to := ds.DateRange["to"]; to != nil {
		return *to
	}
	return ""
}

func (s *Server) handleCreateDataset(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	var payload map[string]any
	if strings.Contains(ct, "multipart") {
		// Node caps uploads at 5MB (routes/datasets.js:31). ParseMultipartForm's
		// argument is only the in-memory budget — without this the rest spills
		// to disk unbounded.
		r.Body = http.MaxBytesReader(w, r.Body, jsonBodyLimit)
		if err := r.ParseMultipartForm(jsonBodyLimit); err != nil {
			writeJSON(w, 400, map[string]any{"error": err.Error()})
			return
		}
		f, _, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "file required"})
			return
		}
		defer f.Close()
		b, _ := io.ReadAll(f)
		if err := json.Unmarshal(b, &payload); err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid json file"})
			return
		}
	} else if err := readJSON(r, &payload); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	stated, _ := payload["adjustedForSplits"].(bool)
	s.savePayload(w, payload, stated)
}

func (s *Server) handlePutDataset(w http.ResponseWriter, r *http.Request) {
	var payload map[string]any
	if err := readJSON(r, &payload); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	id := r.PathValue("id")
	// The payload is a patch: without the stored dataset to merge into, the
	// save drops every field the request did not carry. A failed read must not
	// look like "there is nothing stored yet".
	existing, err := s.DB.GetDatasetMeta(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось получить датасет"})
		return
	}
	// Only the request itself can say its prices contain every split: the
	// flag merged from the stored row would mark a pending split applied
	// on a PATCH of one tag (AUD-140).
	stated, _ := payload["adjustedForSplits"].(bool)
	if existing != nil {
		if _, ok := payload["data"]; !ok {
			// Without prices this is a metadata edit. Saving the bars read above
			// back would delete a refresh that landed in between (AUD-184).
			s.putDatasetMetadata(w, store.SafeTicker(id), payload)
			return
		}
		payload = mergeDatasetPayload(existing, payload)
	}
	payload["ticker"] = id
	s.savePayload(w, payload, stated)
}

func (s *Server) putDatasetMetadata(w http.ResponseWriter, id string, payload map[string]any) {
	var tag, company *string
	for k, v := range payload {
		val := fmtString(v)
		switch k {
		case "tag":
			tag = &val
		case "companyName":
			company = &val
		case "ticker", "id":
		default:
			writeJSON(w, 400, map[string]any{"error": "без data меняются только tag и companyName: " + k})
			return
		}
	}
	if err := s.DB.UpdateDatasetMetadata(id, tag, company); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "id": id, "ticker": id})
}

// mergeDatasetPayload lays a PUT that carries its own bars over the stored
// metadata, so fields the request left out keep their stored values.
func mergeDatasetPayload(existing *store.DatasetMeta, payload map[string]any) map[string]any {
	out := map[string]any{
		"name": existing.Name, "adjustedForSplits": existing.AdjustedForSplits,
		"companyName": existing.CompanyName, "tag": existing.Tag,
	}
	for k, v := range payload {
		out[k] = v
	}
	return out
}

func (s *Server) savePayload(w http.ResponseWriter, payload map[string]any, markApplied bool) {
	ticker := store.SafeTicker(str(payload["ticker"]))
	if ticker == "" {
		ticker = store.SafeTicker(str(payload["name"]))
	}
	if ticker == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	name := str(payload["name"])
	if name == "" {
		name = ticker
	}
	bars := decodeBars(payload["data"])
	if reasons := validateBars(bars); len(reasons) > 0 {
		writeJSON(w, 400, map[string]any{"error": "invalid dataset payload", "reasons": reasons})
		return
	}
	adj, _ := payload["adjustedForSplits"].(bool)
	var events []types.SplitEvent
	if raw, ok := payload["splits"]; ok {
		events = decodeSplitEvents(raw)
	}
	// markApplied: the caller states these prices are already back-adjusted,
	// so the events that come with them are baked in, not pending.
	if err := s.DB.SaveImport(ticker, name, strPtr(payload["companyName"]), strPtr(payload["tag"]), bars, adj, events, markApplied); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	hints, err := s.detectSplitHints(ticker, bars)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Данные сохранены, но сплиты не прочитаны"})
		return
	}
	writeJSON(w, 200, map[string]any{
		"success": true, "id": ticker, "ticker": ticker, "dataPoints": len(bars),
		"adjustedForSplits": adj, "detectedSplits": hints,
	})
}

func decodeSplitEvents(v any) []types.SplitEvent {
	if v == nil {
		return nil
	}
	if events, ok := v.([]types.SplitEvent); ok {
		return events
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var maps []map[string]any
	if json.Unmarshal(raw, &maps) != nil {
		return nil
	}
	return toSplits(maps)
}

func (s *Server) handleRefreshDataset(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный тикер"})
		return
	}
	ds, err := s.DB.GetDatasetMeta(id)
	if err != nil || ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
		return
	}
	st, err := s.DB.SettingsErr()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать настройки"})
		return
	}
	provider := refreshProvider(st, r.URL.Query().Get("provider"))
	if provider == "webull" {
		writeJSON(w, 400, map[string]any{"error": "Webull не поддерживает загрузку исторических данных"})
		return
	}
	lastDate := lastDateFromDataset(ds)
	if lastDate == "" {
		writeJSON(w, 400, map[string]any{"error": "У датасета нет последней даты"})
		return
	}
	startDate := tradingdate.AddDays(lastDate, -7)
	startTs := tradingDateUnix(startDate)
	endTs := time.Now().Unix()
	hist, err := s.Providers.Historical(id, provider, startTs, endTs, "none")
	if err != nil {
		writeProviderError(w, err)
		return
	}
	if reasons := validateBars(hist.Rows); len(reasons) > 0 && len(hist.Rows) > 0 {
		writeJSON(w, 400, map[string]any{"error": "invalid refresh payload", "reasons": reasons})
		return
	}
	existing, _, err := s.DB.GetOHLC(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось получить датасет"})
		return
	}
	have := make(map[string]bool, len(existing))
	for _, b := range existing {
		have[tradingdate.DateKey(b.Date)] = true
	}
	added := 0
	for _, b := range hist.Rows {
		if !have[tradingdate.DateKey(b.Date)] {
			added++
		}
	}
	if len(hist.Splits) > 0 {
		if err := s.DB.UpsertSplits(id, hist.Splits); err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
	}
	company := strPtr(ds.CompanyName)
	tag := strPtr(ds.Tag)
	if err := s.DB.MergeOHLC(id, hist.Rows); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if company != "" || tag != "" {
		if err := s.DB.UpdateDatasetMetadata(id, &tag, &company); err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
	}
	updated, err := s.DB.GetDatasetMeta(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Данные сохранены, но датасет не перечитан"})
		return
	}
	writeJSON(w, 200, map[string]any{
		"success": true, "id": id, "added": added, "to": lastDateFromDataset(updated),
		"provider": provider,
	})
}

func refreshProvider(st map[string]any, query string) string {
	allowed := map[string]bool{"alpha_vantage": true, "finnhub": true, "twelve_data": true, "polygon": true, "robinhood": true}
	if allowed[query] {
		return query
	}
	fromSettings := str(st["resultsRefreshProvider"])
	if allowed[fromSettings] {
		return fromSettings
	}
	return "finnhub"
}

func tradingDateUnix(date string) int64 {
	t, err := time.ParseInLocation("2006-01-02", date, time.UTC)
	if err != nil {
		return time.Now().Add(-7 * 24 * time.Hour).Unix()
	}
	return t.Unix()
}

func (s *Server) handleDeleteDataset(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeleteDataset(r.PathValue("id")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "id": r.PathValue("id")})
}

func strPtr(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case *string:
		if t == nil {
			return ""
		}
		return *t
	}
	return str(v)
}

func (s *Server) handlePatchDatasetMeta(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Неверный идентификатор датасета"})
		return
	}
	if !s.DB.DatasetExists(id) {
		writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
		return
	}
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	var tag, company *string
	if v, ok := body["tag"]; ok {
		s := fmtString(v)
		tag = &s
	}
	if v, ok := body["companyName"]; ok {
		s := fmtString(v)
		company = &s
	}
	if err := s.DB.UpdateDatasetMetadata(id, tag, company); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, map[string]any{"error": "Датасет не найден"})
			return
		}
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "message": "Метаданные датасета обновлены"})
}

func fmtString(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmtSprint(v))
}

func fmtSprint(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return str(v)
}
