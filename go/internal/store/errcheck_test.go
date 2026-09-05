package store

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var stateWritePrefixes = []string{"Save", "Set", "Mark", "Record", "Claim", "Upsert", "Prune", "Delete"}

// allowedDiscardedDBWrites is the explicit list of production call sites that
// still drop a state-writing *store.DB error. Each value says why the
// discard is tolerated. A new unlisted discard fails the build.
var allowedDiscardedDBWrites = map[string]string{
	"internal/live/autotrade.go:SaveWebullTokenChecked": "health stamp during token poll is diagnostic; a failed write must not abort the check",
	"internal/live/actualize.go:SetSettingsKeys": "actualize attempt counters are best-effort; the Telegram alert still fires from memory",

	"internal/live/trade_record.go:DeleteTrade": "fill already journaled; a leftover client-order row is cleaned on the next poll",
	"internal/live/robinhood_broker.go:SaveRobinhoodAccount": "cached account id is an optimisation; the next RH call can look it up again",
	"internal/scheduler/scheduler.go:SetRobinhoodAlerted": "alert already sent; a missed stamp may re-notify, which is safer than blocking the tick",
	"internal/scheduler/scheduler.go:SetWebullAlerted": "same as SetRobinhoodAlerted for the Webull expiry mail",
	"internal/scheduler/scheduler.go:UpsertWebullHealth": "health row is a dashboard cache; the probe result is already in memory this tick",
	"internal/scheduler/scheduler.go:UpsertRobinhoodHealth": "same as UpsertWebullHealth for Robinhood",
}

func TestDiscardDetectorFlagsSaveSettings(t *testing.T) {
	src := `package p
func f(e struct{ DB *int }) { _ = e.DB.SaveSettings(nil) }
`
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "internal/live/fake.go", src, 0)
	if err != nil {
		t.Fatal(err)
	}
	methods := map[string]bool{"SaveSettings": true}
	var hit string
	ast.Inspect(f, func(n ast.Node) bool {
		as, ok := n.(*ast.AssignStmt)
		if !ok || !discardAssign(as) {
			return true
		}
		call, ok := as.Rhs[0].(*ast.CallExpr)
		if !ok {
			return true
		}
		if key, ok := dbWriteCall(fset, call, methods); ok {
			hit = key
		}
		return true
	})
	if hit != "internal/live/fake.go:SaveSettings" {
		t.Fatalf("detector missed _ = e.DB.SaveSettings, got %q", hit)
	}
}

func TestStateWritingDBCallsMustNotBeDiscarded(t *testing.T) {
	methods := storeWriteMethods(t)
	pkgs := []string{"live", "scheduler", "httpapi", "store"}
	found := map[string]bool{}
	for _, pkg := range pkgs {
		dir := filepath.Join("..", pkg)
		fset := token.NewFileSet()
		parsed, err := parser.ParseDir(fset, dir, func(info os.FileInfo) bool {
			name := info.Name()
			return strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
		}, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range parsed {
			for _, f := range p.Files {
				ast.Inspect(f, func(n ast.Node) bool {
					switch stmt := n.(type) {
					case *ast.AssignStmt:
						if !discardAssign(stmt) {
							return true
						}
						if call, ok := stmt.Rhs[0].(*ast.CallExpr); ok {
							if key, ok := dbWriteCall(fset, call, methods); ok {
								found[key] = true
							}
						}
					case *ast.ExprStmt:
						if call, ok := stmt.X.(*ast.CallExpr); ok {
							if key, ok := dbWriteCall(fset, call, methods); ok {
								found[key] = true
							}
						}
					}
					return true
				})
			}
		}
	}
	for key := range found {
		if _, ok := allowedDiscardedDBWrites[key]; !ok {
			t.Errorf("discarded state-writing DB call %s (assign to _ or drop as expression)", key)
		}
	}
	for key := range allowedDiscardedDBWrites {
		if !found[key] {
			t.Errorf("allowlist stale: %s is no longer a discarded write", key)
		}
	}
}

func storeWriteMethods(t *testing.T) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	fset := token.NewFileSet()
	parsed, err := parser.ParseDir(fset, ".", func(info os.FileInfo) bool {
		name := info.Name()
		return strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
	}, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range parsed {
		for _, f := range p.Files {
			for _, d := range f.Decls {
				fn, ok := d.(*ast.FuncDecl)
				if !ok || fn.Recv == nil || fn.Name == nil {
					continue
				}
				if !recvIsDB(fn.Recv) || !writeMethodName(fn.Name.Name) {
					continue
				}
				out[fn.Name.Name] = true
			}
		}
	}
	if len(out) == 0 {
		t.Fatal("no *DB write methods found")
	}
	return out
}

func recvIsDB(fl *ast.FieldList) bool {
	if fl == nil || len(fl.List) == 0 {
		return false
	}
	switch x := fl.List[0].Type.(type) {
	case *ast.StarExpr:
		id, ok := x.X.(*ast.Ident)
		return ok && id.Name == "DB"
	case *ast.Ident:
		return x.Name == "DB"
	}
	return false
}

func writeMethodName(name string) bool {
	for _, p := range stateWritePrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

func discardAssign(stmt *ast.AssignStmt) bool {
	if len(stmt.Lhs) == 0 || len(stmt.Rhs) != 1 {
		return false
	}
	id, ok := stmt.Lhs[0].(*ast.Ident)
	return ok && id.Name == "_"
}

func dbWriteCall(fset *token.FileSet, call *ast.CallExpr, methods map[string]bool) (string, bool) {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel == nil || !methods[sel.Sel.Name] {
		return "", false
	}
	if !selectorLooksLikeDB(sel.X) {
		return "", false
	}
	pos := fset.Position(sel.Sel.Pos())
	dir := filepath.Base(filepath.Dir(pos.Filename))
	base := filepath.Base(pos.Filename)
	return filepath.ToSlash(filepath.Join("internal", dir, base)) + ":" + sel.Sel.Name, true
}

func selectorLooksLikeDB(x ast.Expr) bool {
	switch v := x.(type) {
	case *ast.Ident:
		n := strings.ToLower(v.Name)
		return n == "db" || strings.HasSuffix(n, "db")
	case *ast.SelectorExpr:
		return v.Sel != nil && (v.Sel.Name == "DB" || strings.HasSuffix(v.Sel.Name, "DB"))
	}
	return false
}
