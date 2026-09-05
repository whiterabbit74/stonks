package main

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
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
