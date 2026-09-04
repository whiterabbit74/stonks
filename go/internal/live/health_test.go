package live

import (
	"testing"
	"time"
)

func TestClassifyWebullHealth(t *testing.T) {
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	if st, _ := ClassifyWebullHealth("", "NORMAL", "", now); st != HealthMissing {
		t.Fatalf("empty token %s", st)
	}
	if st, _ := ClassifyWebullHealth("tok", "UNKNOWN", "", now); st != HealthUnreachable {
		t.Fatalf("unknown %s", st)
	}
	if st, _ := ClassifyWebullHealth("tok", "EXPIRED", "", now); st != HealthNeedsReauth {
		t.Fatalf("expired %s", st)
	}
	exp := now.Add(48 * time.Hour).Format(time.RFC3339)
	st, dl := ClassifyWebullHealth("tok", "NORMAL", exp, now)
	if st != HealthExpiringSoon || dl == nil || *dl > 3 {
		t.Fatalf("soon %s %v", st, dl)
	}
}

func TestClassifyRobinhoodHealth(t *testing.T) {
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	if st, _ := ClassifyRobinhoodHealth("", "", "", "", now); st != HealthMissing {
		t.Fatalf("missing %s", st)
	}
	if st, _ := ClassifyRobinhoodHealth("", "r", HealthNeedsReauth, "", now); st != HealthNeedsReauth {
		t.Fatalf("reauth %s", st)
	}
}

func TestRecordedHealthKeepsPreviousOnUnreachable(t *testing.T) {
	if RecordedHealth(HealthOK, HealthUnreachable) != HealthOK {
		t.Fatal("keep previous")
	}
}

func TestShouldHealthAlert(t *testing.T) {
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	send, kind := ShouldHealthAlert("", HealthNeedsReauth, time.Time{}, now)
	if !send || kind != "transition" {
		t.Fatalf("%v %s", send, kind)
	}
	send, _ = ShouldHealthAlert(HealthNeedsReauth, HealthNeedsReauth, now.Add(-time.Hour), now)
	if send {
		t.Fatal("spam")
	}
	send, kind = ShouldHealthAlert(HealthNeedsReauth, HealthNeedsReauth, now.Add(-80*time.Hour), now)
	if !send || kind != "repeat" {
		t.Fatalf("repeat %v %s", send, kind)
	}
	send, kind = ShouldHealthAlert(HealthNeedsReauth, HealthOK, now, now)
	if !send || kind != "restored" {
		t.Fatalf("restore %v %s", send, kind)
	}
	send, _ = ShouldHealthAlert(HealthOK, HealthUnreachable, now, now)
	if send {
		t.Fatal("unreachable alert")
	}
}

// TestBrokersHealthReportsClassifiedStatusNotRawNormal is the P2-8
// regression: BrokersHealth's "status" field is what the SPA compares
// against the literal string 'OK' to decide whether to paint the token
// green. Before P0-4(b), a healthy Webull token's last_check_status held the
// raw Webull word "NORMAL", so RecordedHealth's unreachable-fallback branch
// could hand that raw word straight back out as "status" and the SPA would
// paint a perfectly healthy token red. With last_check_status classified,
// BrokersHealth must always report "OK", never "NORMAL".
func TestBrokersHealthReportsClassifiedStatusNotRawNormal(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	exp := e.now().Add(90 * 24 * time.Hour).Format(time.RFC3339)
	if err := e.DB.SaveWebullTokenChecked("tok", exp, HealthOK, "NORMAL"); err != nil {
		t.Fatal(err)
	}
	hs := e.BrokersHealth()
	var webull *BrokerHealth
	for i := range hs {
		if hs[i].Broker == "webull" {
			webull = &hs[i]
		}
	}
	if webull == nil {
		t.Fatal("no webull entry")
	}
	if webull.Status != HealthOK {
		t.Fatalf("status = %q, want %q (SPA compares against the literal 'OK')", webull.Status, HealthOK)
	}
}
