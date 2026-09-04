package live

import (
	"errors"
	"testing"
)

func TestSizingVariantCCashWhenPresent(t *testing.T) {
	payload := map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": 10000.0, "day_buying_power": 40000.0, "net_liquidation_value": 25000.0,
	}}}}
	funds, _, base, err := resolveEntryBalanceSizing(payload, map[string]any{"entryCapitalMode": "margin_150"}, nil, nil)
	if err != nil { t.Fatal(err) }
	if base != 10000 || funds != 15000 { t.Fatalf("base=%v funds=%v", base, funds) }
}

func TestSizingVariantCResidualWhenCashZero(t *testing.T) {
	payload := map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": 0.0, "day_buying_power": 8000.0, "net_liquidation_value": 10000.0,
	}}}}
	pos := []any{map[string]any{"symbol": "MSFT", "quantity": 10.0, "market_value": 4000.0}}
	funds, _, base, err := resolveEntryBalanceSizing(payload, map[string]any{"entryCapitalMode": "cash_100"}, pos, nil)
	if err != nil { t.Fatal(err) }
	if base != 6000 || funds != 6000 { t.Fatalf("base=%v funds=%v", base, funds) }
}

func TestSizingVariantCRefusesBuyingPowerFallback(t *testing.T) {
	payload := map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": 0.0, "day_buying_power": 8000.0, "net_liquidation_value": 10000.0,
	}}}}
	pos := []any{map[string]any{"symbol": "MSFT", "quantity": 10.0, "market_value": 10000.0}}
	if _, _, _, err := resolveEntryBalanceSizing(payload, map[string]any{"entryCapitalMode": "cash_100"}, pos, nil); err == nil {
		t.Fatal("buying-power fallback must be gone")
	}
}

func TestSizingVariantCPositionsFailClosed(t *testing.T) {
	payload := map[string]any{"data": map[string]any{"account_currency_assets": []any{map[string]any{
		"currency": "USD", "cash_balance": 0.0, "net_liquidation_value": 10000.0, "day_buying_power": 8000.0,
	}}}}
	if _, _, _, err := resolveEntryBalanceSizing(payload, nil, nil, errors.New("timeout")); err == nil {
		t.Fatal("failed Positions() must refuse")
	}
}
