package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode"

	"mktorder.com/go/internal/store"
)

var (
	validClassToken = regexp.MustCompile(`^[A-Za-z_!][A-Za-z0-9_.:/%![\]-]*$`)
	bottomNavCols   = regexp.MustCompile(`class="bottom-nav[^"]*\bgrid-cols-(\d+)\b`)
	darkBgImportant = regexp.MustCompile(`\.dark\s+\.bg-[^{]*\{[^}]*!important`)
	bareUtilities   = map[string]bool{
		"flex": true, "hidden": true, "block": true, "inline": true, "grid": true, "table": true,
		"truncate": true, "relative": true, "absolute": true, "fixed": true, "sticky": true,
		"static": true, "italic": true, "underline": true, "overline": true, "contents": true,
		"grow": true, "shrink": true, "isolate": true, "visible": true, "invisible": true,
		"uppercase": true, "lowercase": true, "capitalize": true, "antialiased": true,
	}
	namedMissing = []string{
		"ml-3", "mr-1", "mr-3", "mr-4", "my-2", "my-3",
		"self-center", "self-end",
		"md:grid-cols-6", "md:grid-cols-10", "lg:grid-cols-5",
		"col-span-full", "max-h-52", "max-h-[400px]", "max-w-3xl",
		"min-h-[375px]", "min-w-[12rem]", "top-8",
		"bg-amber-400", "bg-indigo-50/60", "border-amber-100", "border-red-100",
		"dark:bg-blue-950/40",
	}
)

func readWeb(t *testing.T, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "web", rel))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func jsFn(src, name string) string {
	needle := "function " + name
	start := strings.Index(src, needle)
	if start < 0 {
		return ""
	}
	rest := src[start+len(needle):]
	next := strings.Index(rest, "\n  function ")
	if next < 0 {
		return src[start:]
	}
	return src[start : start+len(needle)+next]
}

// TestUXAppearanceContract is the gating check for the SPA appearance pass:
// bottom-nav columns match items, chrome and md: share 768px, markup classes
// exist in CSS, duplicate ids are gone, footer status follows serverStatus,
// CTAs are indigo, and dark !important no longer overrides dark: utilities.
func TestUXAppearanceContract(t *testing.T) {
	app := readWeb(t, "js/app.js")
	extra := readWeb(t, "css/extra.css")
	appCSS := readWeb(t, "css/app.css")
	charts := readWeb(t, "js/charts.js")
	html := readWeb(t, "index.html")
	css := appCSS + extra

	t.Run("bottom-nav-cols-match-items", func(t *testing.T) {
		start := strings.Index(app, "const BOTTOM = [")
		if start < 0 {
			t.Fatal("missing const BOTTOM")
		}
		end := strings.Index(app[start:], "];")
		if end < 0 {
			t.Fatal("BOTTOM array not closed")
		}
		block := app[start : start+end]
		nItems := strings.Count(block, "{ to:")
		if nItems < 1 {
			t.Fatal("BOTTOM has no items")
		}
		m := bottomNavCols.FindStringSubmatch(app)
		if m == nil {
			t.Fatal("bottom-nav grid-cols-N not found")
		}
		if m[1] != itoa(nItems) {
			t.Fatalf("BOTTOM has %d items but bottom-nav uses grid-cols-%s (cannot be 6 items in grid-cols-5)", nItems, m[1])
		}
		if nItems == 6 && m[1] == "5" {
			t.Fatal("6 bottom-nav links in grid-cols-5")
		}
		menu := jsBlock(app, "const MOBILE_MENU = [", "];")
		for _, route := range []string{"/webull", "/robinhood", "/calendar", "/split", "/watches", "/settings"} {
			if !strings.Contains(menu, route) && !strings.Contains(block, route) {
				t.Errorf("route %s missing from BOTTOM and MOBILE_MENU", route)
			}
		}
	})

	t.Run("chrome-breakpoint-768", func(t *testing.T) {
		if strings.Contains(extra, "769px") {
			t.Fatal("extra.css chrome must not use 769px; md: utilities start at 768px")
		}
		if strings.Contains(extra, "max-width: 768px") {
			t.Fatal("mobile chrome max-width must be 767px (one pixel below md: 768px), not 768px")
		}
		if !strings.Contains(extra, "max-width: 767px") {
			t.Fatal("mobile chrome must use max-width: 767px")
		}
		if !strings.Contains(extra, "min-width: 768px") {
			t.Fatal("desktop chrome / md-aligned rules must use min-width: 768px")
		}
		if !strings.Contains(extra, ".bottom-nav") {
			t.Fatal("extra.css missing .bottom-nav")
		}
	})

	t.Run("class-markup-matches-css", func(t *testing.T) {
		unmatched := unmatchedClassTokens(t, css, map[string]string{
			"js/app.js":    app,
			"js/charts.js": charts,
			"index.html":   html,
		})
		for _, c := range namedMissing {
			for _, u := range unmatched {
				if u == c {
					t.Errorf("named missing class still unmatched: %s", c)
				}
			}
			if !classInCSS(css, c) {
				t.Errorf("named class %s has no CSS rule", c)
			}
		}
		if len(unmatched) > 0 {
			t.Fatalf("unmatched class tokens (%d): %s", len(unmatched), strings.Join(unmatched, ", "))
		}
	})

	t.Run("unique-ids", func(t *testing.T) {
		if n := strings.Count(app, `id="watch-margin"`); n != 1 {
			t.Fatalf("id=watch-margin appears %d times in app.js, want 1", n)
		}
		if n := strings.Count(app, `id="spl-list"`); n != 1 {
			t.Fatalf("id=spl-list appears %d times in app.js, want 1", n)
		}
	})

	t.Run("footer-status-and-brand", func(t *testing.T) {
		footer := jsFn(app, "footerHTML")
		if footer == "" {
			t.Fatal("missing footerHTML")
		}
		chrome := jsFn(app, "updateChrome")
		statusSrc := footer + chrome + jsFn(app, "statusBadgeHTML")
		for _, needle := range []string{"serverStatus", "checking", "offline", "Online", "Offline"} {
			if !strings.Contains(statusSrc, needle) {
				t.Errorf("footer/chrome status must branch on %s", needle)
			}
		}
		if !strings.Contains(statusSrc, "=== 'offline'") && !strings.Contains(statusSrc, `=== "offline"`) {
			t.Fatal("footer status must branch on serverStatus === 'offline'")
		}
		if !strings.Contains(statusSrc, "=== 'checking'") && !strings.Contains(statusSrc, `=== "checking"`) {
			t.Fatal("footer status must branch on serverStatus === 'checking'")
		}
		if strings.Contains(footer, "logo(") {
			t.Fatal("footerHTML must not repeat the brand lockup (logo + heading)")
		}
		if strings.Contains(footer, "<h3") && strings.Contains(footer, "Trading strategies") {
			t.Fatal("footerHTML must not repeat the heading Trading strategies")
		}
		if !strings.Contains(app, "footer-status") {
			t.Fatal("footer status badge must have id footer-status so updateChrome can refresh it")
		}
	})

	t.Run("indigo-cta-and-chips", func(t *testing.T) {
		if strings.Contains(app, "bg-blue-600") {
			t.Fatal("primary CTAs must not use bg-blue-600; indigo btn-primary is the accent")
		}
		if strings.Contains(extra, "#2563eb") {
			t.Fatal("enhance-load / extra.css must not use blue-600 #2563eb")
		}
		load := cssBlock(extra, ".enhance-load")
		if !strings.Contains(load, "#4f46e5") {
			t.Fatal("enhance-load background must be indigo #4f46e5")
		}
		if strings.Contains(app, "bg-blue-100 text-blue-800") {
			t.Fatal("tag filters must use shared chip-on, not blue-100 selected")
		}
		if !strings.Contains(extra, ".chip-on") {
			t.Fatal("missing shared .chip-on selected-state")
		}
		login := jsFn(app, "loginPage")
		if login == "" {
			t.Fatal("missing loginPage")
		}
		if !regexp.MustCompile(`id="login-user"[^>]*\bfield\b`).MatchString(login) {
			t.Fatal("login email input must use .field")
		}
		if !regexp.MustCompile(`id="login-pass"[^>]*\bfield\b`).MatchString(login) {
			t.Fatal("login password input must use .field")
		}
	})

	t.Run("dark-no-important-bg-override", func(t *testing.T) {
		if darkBgImportant.MatchString(css) {
			t.Fatal("shipped CSS must not have .dark .bg-* { !important } overriding dark: utilities")
		}
	})
}

func TestUXSPAAssetsServedTwice(t *testing.T) {
	web, err := filepath.Abs(filepath.Join("..", "..", "web"))
	if err != nil {
		t.Fatal(err)
	}
	var last map[string]string
	for run := 1; run <= 2; run++ {
		dir := t.TempDir()
		db, err := store.Open(filepath.Join(dir, "t.db"))
		if err != nil {
			t.Fatal(err)
		}
		s := New(db, web)
		got := map[string]string{}
		for _, p := range []string{"/", "/css/app.css", "/css/extra.css", "/js/app.js"} {
			req := httptest.NewRequest(http.MethodGet, p, nil)
			rec := httptest.NewRecorder()
			s.Handler().ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("run %d GET %s -> %d, want 200", run, p, rec.Code)
			}
			body := rec.Body.String()
			if body == "" {
				t.Fatalf("run %d GET %s empty body", run, p)
			}
			got[p] = body
		}
		html := got["/"]
		if !strings.Contains(html, "/js/app.js") || !strings.Contains(html, "lightweight-charts.standalone.production.js") {
			t.Fatalf("run %d GET / did not serve the vanilla SPA shell", run)
		}
		if !strings.Contains(got["/css/extra.css"], ".bottom-nav") || !strings.Contains(got["/css/extra.css"], ".btn-primary") {
			t.Fatalf("run %d extra.css missing .bottom-nav / .btn-primary", run)
		}
		if !strings.Contains(got["/css/app.css"], ".bottom-nav") && !strings.Contains(got["/css/extra.css"], ".bottom-nav") {
			t.Fatalf("run %d CSS missing .bottom-nav", run)
		}
		db.Close()
		if last != nil {
			for _, p := range []string{"/", "/css/app.css", "/css/extra.css", "/js/app.js"} {
				if last[p] != got[p] {
					t.Errorf("run 1 and 2 disagree on GET %s (%d vs %d bytes)", p, len(last[p]), len(got[p]))
				}
			}
		}
		last = got
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func jsBlock(src, startNeedle, endNeedle string) string {
	start := strings.Index(src, startNeedle)
	if start < 0 {
		return ""
	}
	end := strings.Index(src[start:], endNeedle)
	if end < 0 {
		return src[start:]
	}
	return src[start : start+end]
}

func cssBlock(src, selector string) string {
	i := strings.Index(src, selector)
	if i < 0 {
		return ""
	}
	rest := src[i:]
	open := strings.Index(rest, "{")
	if open < 0 {
		return rest
	}
	depth := 0
	for j := open; j < len(rest); j++ {
		switch rest[j] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return rest[:j+1]
			}
		}
	}
	return rest
}

func unmatchedClassTokens(t *testing.T, css string, files map[string]string) []string {
	t.Helper()
	seen := map[string]bool{}
	var out []string
	for _, src := range files {
		for _, tok := range classTokens(src) {
			if seen[tok] {
				continue
			}
			if classInCSS(css, tok) {
				continue
			}
			seen[tok] = true
			out = append(out, tok)
		}
	}
	return out
}

func cssEscapeClass(className string) string {
	var b strings.Builder
	b.WriteByte('.')
	for _, r := range className {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('\\')
			b.WriteRune(r)
		}
	}
	return b.String()
}

func classInCSS(css, className string) bool {
	needle := cssEscapeClass(className)
	from := 0
	for {
		i := strings.Index(css[from:], needle)
		if i < 0 {
			return false
		}
		i += from
		end := i + len(needle)
		if end >= len(css) || !isClassNameContinue(css[end]) {
			return true
		}
		from = i + 1
	}
}

func isClassNameContinue(c byte) bool {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-'
}

func classTokens(src string) []string {
	var tokens []string
	for i := 0; i < len(src); {
		idx := strings.Index(src[i:], `class="`)
		if idx < 0 {
			break
		}
		start := i + idx + len(`class="`)
		end, ok := scanAttrEnd(src, start, '"')
		if !ok {
			i = start
			continue
		}
		tokens = append(tokens, tokensFromClassValue(src[start:end])...)
		i = end + 1
	}
	return tokens
}

func scanAttrEnd(s string, start int, quote byte) (int, bool) {
	depth := 0
	for i := start; i < len(s); i++ {
		if s[i] == '$' && i+1 < len(s) && s[i+1] == '{' {
			depth++
			i++
			continue
		}
		if depth > 0 {
			switch s[i] {
			case '{':
				depth++
			case '}':
				depth--
			}
			continue
		}
		if s[i] == quote {
			return i, true
		}
		if s[i] == '\n' {
			return 0, false
		}
	}
	return 0, false
}

func keepClassToken(tok string, fromInterp bool) bool {
	if !validClassToken.MatchString(tok) {
		return false
	}
	if !fromInterp {
		return true
	}
	if bareUtilities[tok] {
		return true
	}
	for _, r := range tok {
		if r == '-' || r == ':' || r == '/' || r == '[' || r == ']' || r == '!' || r == '.' {
			return true
		}
	}
	return false
}

func tokensFromClassValue(val string) []string {
	var out []string
	var rest strings.Builder
	for i := 0; i < len(val); {
		if val[i] == '$' && i+1 < len(val) && val[i+1] == '{' {
			depth := 1
			j := i + 2
			for j < len(val) && depth > 0 {
				switch val[j] {
				case '{':
					depth++
				case '}':
					depth--
				}
				j++
			}
			inner := val[i+2 : j-1]
			for _, q := range quotedIn(inner) {
				for _, tok := range strings.Fields(q) {
					if keepClassToken(tok, true) {
						out = append(out, tok)
					}
				}
			}
			rest.WriteByte(' ')
			i = j
			continue
		}
		rest.WriteByte(val[i])
		i++
	}
	for _, tok := range strings.Fields(rest.String()) {
		if keepClassToken(tok, false) {
			out = append(out, tok)
		}
	}
	return out
}

func quotedIn(s string) []string {
	var out []string
	for i := 0; i < len(s); i++ {
		q := s[i]
		if q != '\'' && q != '"' {
			continue
		}
		j := i + 1
		for j < len(s) && s[j] != q {
			if s[j] == '\\' && j+1 < len(s) {
				j += 2
				continue
			}
			j++
		}
		if j < len(s) {
			out = append(out, s[i+1:j])
			i = j
		}
	}
	return out
}
