package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func staticCacheControl(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".js", ".css":
		return "no-cache, must-revalidate"
	case ".ttf", ".otf", ".woff", ".woff2", ".eot",
		".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico":
		return "public, max-age=31536000, immutable"
	default:
		return ""
	}
}

func (s *Server) serveWeb(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	p := r.URL.Path
	if p == "/" {
		p = "/index.html"
	}
	full := filepath.Join(s.WebDir, filepath.Clean(p))
	if !strings.HasPrefix(full, s.WebDir) {
		http.NotFound(w, r)
		return
	}
	if _, err := os.Stat(full); err == nil && !strings.HasSuffix(full, "/") {
		if strings.HasSuffix(p, "index.html") || p == "/index.html" {
			s.serveIndex(w, r, full)
			return
		}
		if cc := staticCacheControl(p); cc != "" {
			w.Header().Set("Cache-Control", cc)
		}
		http.ServeFile(w, r, full)
		return
	}
	s.serveIndex(w, r, filepath.Join(s.WebDir, "index.html"))
}

// Every SPA script under /js/ gets the build version, so a deploy busts all of them.
var jsSrcRe = regexp.MustCompile(`src="/js/[^"?]+\.js"`)

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request, path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	v := s.BuildID
	if v == "" {
		v = "dev"
	}
	html := string(b)
	html = jsSrcRe.ReplaceAllStringFunc(html, func(m string) string { return strings.TrimSuffix(m, `"`) + `?v=` + v + `"` })
	html = strings.ReplaceAll(html, `href="/css/app.css"`, `href="/css/app.css?v=`+v+`"`)
	html = strings.ReplaceAll(html, `href="/css/extra.css"`, `href="/css/extra.css?v=`+v+`"`)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(html))
}
