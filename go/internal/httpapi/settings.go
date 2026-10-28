package httpapi

import (
	"net/http"
	"os"
	"sort"

	"mktorder.com/go/internal/store"
)

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	// Unreadable settings are not factory settings: answering with the
	// defaults would show the operator thresholds and provider keys that are
	// not the ones in force (AUD-020 class).
	st, err := s.DB.SettingsErr()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать настройки"})
		return
	}
	writeJSON(w, 200, clientSettings(st))
}

func settingsWriteError(body map[string]any) string {
	if _, ok := body["autoTrading"]; ok {
		return "autoTrading must be updated through /api/autotrade/config"
	}
	var unknown []string
	for k := range body {
		if !store.AllowedSettingsKey(k) {
			unknown = append(unknown, k)
		}
	}
	if len(unknown) == 0 {
		return ""
	}
	sort.Strings(unknown)
	return "unknown settings key: " + unknown[0]
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	if msg := settingsWriteError(body); msg != "" {
		writeJSON(w, 400, map[string]any{"error": msg})
		return
	}
	if err := s.DB.SetSettingsKeys(body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	st, err := s.DB.SettingsErr()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Настройки сохранены, но не перечитаны"})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "settings": clientSettings(st)})
}

func (s *Server) handlePatchSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	if msg := settingsWriteError(body); msg != "" {
		writeJSON(w, 400, map[string]any{"error": msg})
		return
	}
	if err := s.DB.SetSettingsKeys(body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "message": "Settings updated successfully"})
}

func clientSettings(st map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range st {
		if k == "polygonApiKey" {
			continue
		}
		out[k] = v
	}
	key, _ := st["polygonApiKey"].(string)
	out["polygonApiKeyConfigured"] = key != "" || os.Getenv("POLYGON_API_KEY") != ""
	return out
}
