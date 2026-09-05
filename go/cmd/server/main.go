package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"mktorder.com/go/internal/httpapi"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/scheduler"
	"mktorder.com/go/internal/store"
)

const shutdownTimeout = 60 * time.Second

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
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
		return fmt.Errorf("db: %w", err)
	}
	defer db.Close()
	webDir := filepath.Join(root, "web")
	p := providers.FromEnv()
	srv := httpapi.NewWithProviders(db, webDir, p)
	stop := scheduler.StartWith(db, scheduler.Deps{Providers: p, Live: srv.Live}, nil)
	stopOnce := sync.OnceFunc(stop)
	defer stopOnce()

	addr := ":" + port
	log.Printf("Go trading API+UI on http://localhost%s (db=%s web=%s)", addr, dbPath, webDir)
	s := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// WriteTimeout is longer than ReadTimeout because in-process backtests
		// and upstream provider fetches routinely run past 30s.
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	return serve(ctx, s, shutdownTimeout, stopOnce)
}

type httpServer interface {
	ListenAndServe() error
	Shutdown(ctx context.Context) error
}

func serve(ctx context.Context, s httpServer, timeout time.Duration, onShutdown func()) error {
	errCh := make(chan error, 1)
	go func() {
		errCh <- s.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		log.Printf("shutting down (timeout %s)", timeout)
		if onShutdown != nil {
			onShutdown()
		}
		shutCtx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		if err := s.Shutdown(shutCtx); err != nil {
			return err
		}
		err := <-errCh
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
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
