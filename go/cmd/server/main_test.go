package main

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mktorder.com/go/internal/scheduler"
)

type stubServer struct {
	listen   func() error
	shutdown func(context.Context) error
}

func (s stubServer) ListenAndServe() error { return s.listen() }
func (s stubServer) Shutdown(ctx context.Context) error {
	return s.shutdown(ctx)
}

func TestServeCancelTriggersShutdown(t *testing.T) {
	listening := make(chan struct{})
	shutdownStarted := make(chan struct{})
	var mu sync.Mutex
	var order []string
	push := func(step string) {
		mu.Lock()
		order = append(order, step)
		mu.Unlock()
	}

	s := stubServer{
		listen: func() error {
			close(listening)
			<-shutdownStarted
			return http.ErrServerClosed
		},
		shutdown: func(ctx context.Context) error {
			if _, ok := ctx.Deadline(); !ok {
				t.Error("Shutdown context has no deadline")
			}
			push("shutdown")
			close(shutdownStarted)
			return nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-listening
		cancel()
	}()

	err := serve(ctx, s, 50*time.Millisecond, func() { push("stop") })
	if err != nil {
		t.Fatalf("serve: %v", err)
	}
	mu.Lock()
	got := append([]string(nil), order...)
	mu.Unlock()
	if len(got) < 2 || got[0] != "stop" || got[1] != "shutdown" {
		t.Fatalf("want stop then shutdown, got %v", got)
	}
}

func TestServeListenError(t *testing.T) {
	want := errors.New("bind")
	var shutdown atomic.Bool
	s := stubServer{
		listen: func() error { return want },
		shutdown: func(context.Context) error {
			shutdown.Store(true)
			return nil
		},
	}
	err := serve(context.Background(), s, time.Second, func() {
		t.Error("onShutdown must not run on listen failure")
	})
	if !errors.Is(err, want) {
		t.Fatalf("got %v want %v", err, want)
	}
	if shutdown.Load() {
		t.Fatal("Shutdown must not run on listen failure")
	}
}

func TestSchedulerLogKeepsFailuresAndDropsChatter(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	for _, j := range []scheduler.JobLog{
		{Name: "tick", Detail: "duration_ms=3"},
		{Name: "order-trackers", Detail: "pending=0"},
		{Name: "broker-token-health", Detail: "already-ran", Skipped: true},
		{Name: "market-jobs", Detail: "non-trading-day", Skipped: true},
		{Name: "calendar-extend", Detail: "marker-save-failed: disk full"},
		{Name: "tick-panic", Detail: "runtime error"},
	} {
		schedulerLog(j)
	}
	out := buf.String()
	if strings.Contains(out, "duration_ms") || strings.Contains(out, "already-ran") || strings.Contains(out, "non-trading-day") {
		t.Fatalf("routine chatter must not reach the log:\n%s", out)
	}
	if !strings.Contains(out, "marker-save-failed") || !strings.Contains(out, "tick-panic") {
		t.Fatalf("failures must reach the log:\n%s", out)
	}
}
