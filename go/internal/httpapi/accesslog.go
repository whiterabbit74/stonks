package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const accessBodyPeek = 4096

var secretFieldRe = regexp.MustCompile(`(?i)(password|passwd|secret|token|authorization|cookie|api[_-]?key|app[_-]?(key|secret)|access[_-]?token)`)

type apiLogRec struct {
	TS      string `json:"ts"`
	Method  string `json:"method"`
	Path    string `json:"path"`
	Query   string `json:"query,omitempty"`
	Status  int    `json:"status"`
	Ms      int64  `json:"ms"`
	Bytes   int    `json:"bytes"`
	IP      string `json:"ip"`
	UA      string `json:"ua,omitempty"`
	Auth    bool   `json:"auth"`
	Body    any    `json:"body,omitempty"`
	BodyLen int64  `json:"bodyLen,omitempty"`
}

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		body, bodyLen := peekAPIBody(r)
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		rec := apiLogRec{
			TS:     start.UTC().Format(time.RFC3339Nano),
			Method: r.Method,
			Path:   clip(r.URL.Path, 256),
			Status: status,
			Ms:     time.Since(start).Milliseconds(),
			Bytes:  sw.bytes,
			IP:     clientIP(r),
			Auth:   cookieToken(r) != "",
		}
		if status != http.StatusTooManyRequests {
			rec.Query = clip(redactQuery(r.URL.RawQuery), 512)
			rec.UA = clip(r.Header.Get("User-Agent"), 200)
			rec.Body = body
			rec.BodyLen = bodyLen
		}
		writeAPILog(rec)
	})
}

func peekAPIBody(r *http.Request) (any, int64) {
	if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead {
		return nil, r.ContentLength
	}
	path := r.URL.Path
	if strings.HasPrefix(path, "/api/calc/") ||
		(strings.HasPrefix(path, "/api/datasets") && (r.Method == http.MethodPost || r.Method == http.MethodPut)) {
		return nil, r.ContentLength
	}
	ct := strings.ToLower(r.Header.Get("Content-Type"))
	if !strings.Contains(ct, "json") {
		return nil, r.ContentLength
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, accessBodyPeek+1))
	if err != nil && err != io.EOF {
		return nil, r.ContentLength
	}
	r.Body = io.NopCloser(io.MultiReader(bytes.NewReader(raw), r.Body))
	n := int64(len(raw))
	if r.ContentLength > n {
		n = r.ContentLength
	}
	if len(raw) > accessBodyPeek {
		return map[string]any{"_truncated": true}, n
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil, n
	}
	return redactJSON(v), n
}

func redactQuery(raw string) string {
	if raw == "" {
		return ""
	}
	q, err := url.ParseQuery(raw)
	if err != nil {
		return secretQueryRe.ReplaceAllString(raw, "$1=[redacted]")
	}
	for k := range q {
		if secretFieldRe.MatchString(k) {
			q.Set(k, "[redacted]")
		}
	}
	return q.Encode()
}

func redactJSON(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			if secretFieldRe.MatchString(k) {
				out[k] = "[redacted]"
				continue
			}
			out[k] = redactJSON(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = redactJSON(val)
		}
		return out
	default:
		return v
	}
}

func clip(s string, n int) string {
	if n <= 0 || len(s) <= n {
		return s
	}
	return s[:n]
}

func writeAPILog(rec apiLogRec) {
	log.Printf("api %s %s %d %dms ip=%s", rec.Method, rec.Path, rec.Status, rec.Ms, rec.IP)
	line, err := json.Marshal(rec)
	if err != nil {
		return
	}
	line = append(line, '\n')
	appendHTTPLog(line)
}

var (
	httpLogMu   sync.Mutex
	httpLogFile *os.File
	httpLogName string
)

func httpLogPath() string {
	if p := strings.TrimSpace(os.Getenv("HTTP_LOG_PATH")); p != "" {
		return p
	}
	if d := strings.TrimSpace(os.Getenv("DATASETS_DIR")); d != "" {
		return filepath.Join(d, "http-access.jsonl")
	}
	if db := strings.TrimSpace(os.Getenv("DB_FILE")); db != "" {
		return filepath.Join(filepath.Dir(db), "http-access.jsonl")
	}
	return ""
}

func httpLogPathFor(now time.Time) string {
	p := httpLogPath()
	if p == "" {
		return ""
	}
	ext := filepath.Ext(p)
	base := strings.TrimSuffix(p, ext)
	if ext == "" {
		ext = ".jsonl"
	}
	return base + "-" + now.UTC().Format("2006-01") + ext
}

func appendHTTPLog(line []byte) {
	path := httpLogPathFor(time.Now())
	if path == "" {
		return
	}
	httpLogMu.Lock()
	defer httpLogMu.Unlock()
	if httpLogFile == nil || httpLogName != path {
		if httpLogFile != nil {
			_ = httpLogFile.Close()
			httpLogFile = nil
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			log.Printf("http log mkdir: %v", err)
			return
		}
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o640)
		if err != nil {
			log.Printf("http log open: %v", err)
			return
		}
		httpLogFile = f
		httpLogName = path
	}
	if _, err := httpLogFile.Write(line); err != nil {
		log.Printf("http log write: %v", err)
	}
}

func resetHTTPLogForTest() {
	httpLogMu.Lock()
	defer httpLogMu.Unlock()
	if httpLogFile != nil {
		_ = httpLogFile.Close()
		httpLogFile = nil
		httpLogName = ""
	}
}
