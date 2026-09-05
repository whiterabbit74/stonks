package live

import "testing"

func TestComputeOrderQuantityMatchesNode(t *testing.T) {
	payload := map[string]any{
		"data": map[string]any{
			"account_currency_assets": []any{
				map[string]any{
					"currency":              "USD",
					"day_buying_power":      502.27,
					"cash_balance":          502.27,
					"net_liquidation_value": 502.27,
				},
			},
		},
	}
	safe := map[string]any{"entryCapitalMode": "standard_safe"}
	funds, _, _, err := resolveEntryBalanceSizing(payload, safe, nil, nil)
	q, err := ComputeOrderQuantity(250.23, safe, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 1 {
		t.Fatalf("standard_safe qty=%v want 1", q)
	}

	// cash_100 has no reserve of its own, but P1-6 floors every mode's reserve
	// at minEntryReservePct, which trims one more share off the naive figure.
	cash := map[string]any{"entryCapitalMode": "cash_100"}
	funds, _, _, err = resolveEntryBalanceSizing(payload, cash, nil, nil)
	q, err = ComputeOrderQuantity(250.23, cash, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 1 {
		t.Fatalf("cash_100 qty=%v want 1", q)
	}

	marginPayload := map[string]any{
		"data": map[string]any{
			"account_currency_assets": []any{
				map[string]any{
					"currency":              "USD",
					"day_buying_power":      1000.0,
					"cash_balance":          500.0,
					"net_liquidation_value": 500.0,
				},
			},
		},
	}
	margin := map[string]any{"entryCapitalMode": "margin_200"}
	funds, _, _, err = resolveEntryBalanceSizing(marginPayload, margin, nil, nil)
	if funds != 1000 {
		t.Fatalf("margin funds=%v want 1000", funds)
	}
	q, err = ComputeOrderQuantity(250, margin, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 3 {
		t.Fatalf("margin_200 qty=%v want 3", q)
	}

}

// TestComputeOrderQuantityReservesFundsInEveryCapitalMode is the P1-6
// regression: every capital mode must leave at least MinEntryReservePct of
// availableFunds unspent, so a quote-to-fill price move does not bounce the
// order for insufficient buying power. Before this fix only standard_safe
// carried a reserve; the margin and cash_100 modes sized to the last cent.
func TestComputeOrderQuantityReservesFundsInEveryCapitalMode(t *testing.T) {
	const availableFunds = 10000.0
	const currentPrice = 37.13 // an odd price so flooring actually bites

	for _, info := range CapitalModeInfos() {
		mode := info.Value
		cfg := map[string]any{"entryCapitalMode": mode}
		q, err := ComputeOrderQuantity(currentPrice, cfg, availableFunds)
		if err != nil {
			t.Fatalf("%s: %v", mode, err)
		}
		limit := availableFunds * (1 - MinEntryReservePct)
		if spend := q * currentPrice; spend > limit {
			t.Fatalf("%s: qty*price=%v exceeds reserved limit %v (availableFunds=%v)", mode, spend, limit, availableFunds)
		}
	}
}

// TestComputeOrderQuantityHonorsConfiguredReserveAndSlippage covers the two
// levers P1-6 wires into sizing: an operator-set entryReservePct floor, and
// maxSlippageBps, which used to be reported only and now also floors the
// reserve (max(minReserve, maxSlippageBps/10000)).
func TestComputeOrderQuantityHonorsConfiguredReserveAndSlippage(t *testing.T) {
	const availableFunds = 10000.0
	const currentPrice = 37.13

	cfg := map[string]any{"entryCapitalMode": "cash_100", "entryReservePct": 0.05}
	q, err := ComputeOrderQuantity(currentPrice, cfg, availableFunds)
	if err != nil {
		t.Fatal(err)
	}
	if limit := availableFunds * (1 - 0.05); q*currentPrice > limit {
		t.Fatalf("entryReservePct not honored: qty*price=%v > %v", q*currentPrice, limit)
	}

	cfg = map[string]any{"entryCapitalMode": "cash_100", "maxSlippageBps": 300.0} // 3%
	q, err = ComputeOrderQuantity(currentPrice, cfg, availableFunds)
	if err != nil {
		t.Fatal(err)
	}
	if limit := availableFunds * (1 - 0.03); q*currentPrice > limit {
		t.Fatalf("maxSlippageBps not tied into reserve: qty*price=%v > %v", q*currentPrice, limit)
	}
}

// TestStandardSafeReserveNotWeakened locks in that P1-6's floor only ever
// raises a mode's reserve, never lowers standard_safe's existing 2.2%.
func TestStandardSafeReserveNotWeakened(t *testing.T) {
	_, reservePct := capitalModeConfig(map[string]any{"entryCapitalMode": "standard_safe"})
	if reservePct < 0.022 {
		t.Fatalf("standard_safe reserve weakened to %v, want >= 0.022", reservePct)
	}
}

func TestEffectiveReservePctFormula(t *testing.T) {
	defaults := map[string]any{"entryCapitalMode": "cash_100", "maxSlippageBps": 25.0}
	got := EffectiveReservePct(defaults)
	if got != MinEntryReservePct {
		t.Fatalf("cash_100 at defaults reserve=%v want %v", got, MinEntryReservePct)
	}

	safe := EffectiveReservePct(map[string]any{"entryCapitalMode": "standard_safe", "maxSlippageBps": 25.0})
	if safe != 0.022 {
		t.Fatalf("standard_safe reserve=%v want 0.022", safe)
	}

	raised := EffectiveReservePct(map[string]any{
		"entryCapitalMode": "cash_100", "entryReservePct": 0.05, "maxSlippageBps": 25.0,
	})
	if raised != 0.05 {
		t.Fatalf("entryReservePct floor not applied: %v", raised)
	}

	slip := EffectiveReservePct(map[string]any{
		"entryCapitalMode": "cash_100", "maxSlippageBps": 300.0,
	})
	if slip != 0.03 {
		t.Fatalf("maxSlippageBps floor not applied: %v", slip)
	}

	for _, info := range CapitalModeInfos() {
		mult, reserve := capitalModeConfig(map[string]any{"entryCapitalMode": info.Value})
		if mult != info.Multiplier {
			t.Fatalf("%s multiplier=%v want %v", info.Value, mult, info.Multiplier)
		}
		want := info.ReservePct
		if want < MinEntryReservePct {
			want = MinEntryReservePct
		}
		if reserve != want {
			t.Fatalf("%s reserve=%v want %v", info.Value, reserve, want)
		}
	}
}

// An exit sells everything the broker holds. A split can leave a fractional
// quantity behind an entry that was whole, and rounding it down here would
// close the journal on a position that is still partly open.
func TestPositionQuantityIsExact(t *testing.T) {
	pos := []any{map[string]any{"symbol": "AAPL", "quantity": 7.5}}
	if got := PositionQuantity(pos, "aapl"); got != 7.5 {
		t.Fatalf("got %v", got)
	}
}
