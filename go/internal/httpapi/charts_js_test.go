package httpapi

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestChartsJSMapping(t *testing.T) {
	web, err := filepath.Abs(filepath.Join("..", "..", "web", "js"))
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", "--test", "charts_map_test.cjs")
	cmd.Dir = web
	cmd.Env = append(os.Environ(), "TZ=Pacific/Auckland")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("charts mapping test failed: %v\n%s", err, out)
	}
}
