package live

import (
	"strings"
	"testing"
)

func TestEmaInlineLineShowsCurrentPrice(t *testing.T) {
	got := buildEmaInlineBlock([]EmaEval{{Symbol: "TQQQ", Action: "sell", DataOK: true, Price: 101.234, DeviationPct: 22.73, ActiveLevelPct: 40}})
	if !strings.Contains(got, "$101.23") {
		t.Fatalf("no price in %q", got)
	}
}
