package backtest

import (
	"os"
	"strings"
	"testing"
)

func TestCleanFinalBarExitUsesIbsPackage(t *testing.T) {
	raw, err := os.ReadFile("clean.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	if strings.Contains(src, "lastIBS > highIBS") {
		t.Fatal("final-bar IBS exit still compares lastIBS > highIBS; use ibssig.IsExitSignal")
	}
	marker := "lastIBS := ibsValues[len(data)-1]"
	i := strings.Index(src, marker)
	if i < 0 {
		t.Fatal("final-bar lastIBS assignment not found")
	}
	tail := src[i:]
	if !strings.Contains(tail, "ibssig.IsExitSignal") && !strings.Contains(tail, "IsExitSignal(") {
		t.Fatal("final-bar IBS exit must go through ibssig.IsExitSignal")
	}
}
