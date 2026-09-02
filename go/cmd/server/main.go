package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"mktorder.com/go/internal/httpapi"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/scheduler"
	"mktorder.com/go/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	root := findRoot()
	dbPath := os.Getenv("DB_FILE")
	if dbPath == "" {
		dbPath = filepath.Join(root, "data", "trading.db")
	}
	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Close()
	webDir := filepath.Join(root, "web")
	p := providers.FromEnv()
	srv := httpapi.NewWithProviders(db, webDir, p)
	stop := scheduler.StartWith(db, scheduler.Deps{Providers: p, Live: srv.Live}, nil)
	defer stop()

	addr := ":" + port
	log.Printf("Go trading API+UI on http://localhost%s (db=%s web=%s)", addr, dbPath, webDir)
	s := &http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}
	if err := s.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func findRoot() string {
	if v := os.Getenv("GOAPP_ROOT"); v != "" {
		return v
	}
	wd, _ := os.Getwd()
	if filepath.Base(wd) == "server" || filepath.Base(wd) == "cmd" {
		return filepath.Clean(filepath.Join(wd, "..", ".."))
	}
	// cmd/server -> ../../
	if _, err := os.Stat(filepath.Join(wd, "web")); err == nil {
		return wd
	}
	if _, err := os.Stat(filepath.Join(wd, "go", "web")); err == nil {
		return filepath.Join(wd, "go")
	}
	return filepath.Clean(filepath.Join(wd, "..", ".."))
}
