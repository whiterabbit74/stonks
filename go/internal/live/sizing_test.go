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
	safe := map[string]any{"entrySizingMode": "balance", "allowFractionalShares": false, "entryCapitalMode": "standard_safe"}
	funds, _, _ := resolveEntryBalanceSizing(payload, safe)
	q, err := ComputeOrderQuantity(250.23, safe, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 1 {
		t.Fatalf("standard_safe qty=%v want 1", q)
	}

	cash := map[string]any{"entrySizingMode": "balance", "allowFractionalShares": false, "entryCapitalMode": "cash_100"}
	funds, _, _ = resolveEntryBalanceSizing(payload, cash)
	q, err = ComputeOrderQuantity(250.23, cash, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 2 {
		t.Fatalf("cash_100 qty=%v want 2", q)
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
	margin := map[string]any{"entrySizingMode": "balance", "allowFractionalShares": false, "entryCapitalMode": "margin_200"}
	funds, _, _ = resolveEntryBalanceSizing(marginPayload, margin)
	if funds != 1000 {
		t.Fatalf("margin funds=%v want 1000", funds)
	}
	q, err = ComputeOrderQuantity(250, margin, funds)
	if err != nil {
		t.Fatal(err)
	}
	if q != 4 {
		t.Fatalf("margin_200 qty=%v want 4", q)
	}

	qtyMode := map[string]any{"entrySizingMode": "quantity", "fixedQuantity": 3.0}
	q, err = ComputeOrderQuantity(10, qtyMode, 0)
	if err != nil || q != 3 {
		t.Fatalf("quantity mode %v %v", q, err)
	}

	notional := map[string]any{"entrySizingMode": "notional", "fixedNotionalUsd": 1000.0, "maxPositionUsd": 400.0}
	q, err = ComputeOrderQuantity(100, notional, 0)
	if err != nil || q != 4 {
		t.Fatalf("notional cap %v %v", q, err)
	}
}

func TestPositionQuantity(t *testing.T) {
	pos := []any{map[string]any{"symbol": "AAPL", "quantity": 7.9}}
	if got := PositionQuantity(pos, "aapl", false); got != 7 {
		t.Fatalf("got %v", got)
	}
}
