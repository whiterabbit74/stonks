package live

import (
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// pendingTokenBroker answers Webull's own CheckToken with the raw word
// "PENDING" (an SMS-approval-pending token), the way a real webull.Client
// would. It is used to prove TokenHealth() classifies that raw word into the
// engine's health vocabulary instead of writing it straight into
// last_check_status (P0-4).
type pendingTokenBroker struct{ *MemoryBroker }

func (b *pendingTokenBroker) CheckToken(token string) (map[string]any, error) {
	return map[string]any{"status": "PENDING", "token": token}, nil
}

// TestTokenHealthClassifiesRawStatus is the P0-4 regression: TokenHealth()
// must store a classified verdict (NEEDS_REAUTH) in last_check_status and
// keep Webull's raw word ("PENDING") in last_check_raw, not collapse both
// into the raw value the way the code did before the fix.
func TestTokenHealthClassifiesRawStatus(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Broker = &pendingTokenBroker{&MemoryBroker{}}
	if err := e.DB.SaveWebullToken("tok", "2099-01-01", "PENDING"); err != nil {
		t.Fatal(err)
	}

	raw := e.TokenHealth()
	if raw != "PENDING" {
		t.Fatalf("TokenHealth must surface the raw Webull word, got %q", raw)
	}
	row := e.DB.GetWebullToken()
	if row.LastCheckStatus != HealthNeedsReauth {
		t.Fatalf("last_check_status = %q, want classified %q", row.LastCheckStatus, HealthNeedsReauth)
	}
	if row.LastCheckRaw != "PENDING" {
		t.Fatalf("last_check_raw = %q, want raw %q", row.LastCheckRaw, "PENDING")
	}
}

// TestCanSubmitAndExecuteAllGateOnPendingWebullHealth is the "Чем закрыть"
// regression from AUTOTRADE_ROADMAP.md P0-4: a token whose last check came
// back PENDING must block CanSubmit() and make executeAll skip the webull
// broker with reason=NEEDS_REAUTH, proving the storedHealthStatus/CanSubmit
// gate — dead before the fix, since it compared HealthNeedsReauth/HealthMissing
// against a raw word that never equalled them — actually fires now.
func TestCanSubmitAndExecuteAllGateOnPendingWebullHealth(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Broker = &pendingTokenBroker{br}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	if err := e.DB.SaveWebullToken("tok", "2099-01-01", "PENDING"); err != nil {
		t.Fatal(err)
	}

	if raw := e.TokenHealth(); raw != "PENDING" {
		t.Fatalf("setup: want PENDING check, got %q", raw)
	}

	if e.CanSubmit() {
		t.Fatal("a PENDING (unconfirmed) token must not report CanSubmit == true")
	}

	res := e.Execute("t1")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("no order should have been submitted while NEEDS_REAUTH: %+v orders=%d", res, len(br.Orders))
	}
	webullDecision := res.BrokerDecisions["webull"]
	if reason, _ := webullDecision["reason"].(string); reason != HealthNeedsReauth {
		t.Fatalf("want webull decision reason=%s, got %+v", HealthNeedsReauth, webullDecision)
	}
	if !hasAutotradeLog(t, e, "event=execution_skipped") || !hasAutotradeLog(t, e, "reason="+HealthNeedsReauth) {
		t.Fatal("want the NEEDS_REAUTH skip logged")
	}
}

// TestPatchAutoConfigUsesEngineClock is the P2-8 regression: saving the
// autotrading config must stamp lastModifiedAt with the engine's clock
// (e.now(), which tests pin via e.Now), not the wall-clock time.Now(), the
// same way every other timestamped write in this package already does.
func TestPatchAutoConfigUsesEngineClock(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	pinned := time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC)
	e.Now = func() time.Time { return pinned }

	cfg := e.PatchAutoConfig(map[string]any{"enabled": true})
	got, _ := cfg["lastModifiedAt"].(string)
	want := pinned.UTC().Format(time.RFC3339Nano)
	if got != want {
		t.Fatalf("lastModifiedAt = %q, want the pinned engine clock %q", got, want)
	}
}
