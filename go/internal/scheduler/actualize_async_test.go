package scheduler

import (
	"os"
	"strings"
	"testing"
)

func TestRunTickDoesNotBlockOnPriceActualization(t *testing.T) {
	raw, err := os.ReadFile("scheduler.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	start := strings.Index(src, "func RunTick(")
	if start < 0 {
		t.Fatal("RunTick not found")
	}
	fn := src[start:]
	if i := strings.Index(fn[10:], "\nfunc "); i > 0 {
		fn = fn[:10+i]
	}
	idx := strings.Index(fn, "RunPriceActualization(")
	if idx < 0 {
		t.Fatal("RunTick must still call RunPriceActualization")
	}
	window := fn[:idx]
	if !strings.Contains(window[len(window)-80:], "go ") {
		t.Fatal("RunTick must start price actualization in a goroutine")
	}
}

func TestRunPriceActualizationSkipsWhenInFlight(t *testing.T) {
	actualizeMu.Lock()
	defer actualizeMu.Unlock()
	n, f := RunPriceActualization(nil, Deps{})
	if n != 0 || f != 0 {
		t.Fatalf("in-flight actualize must skip, got ok=%d fail=%d", n, f)
	}
}
