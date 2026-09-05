package optionsmath

import (
	"math"
	"testing"

	"mktorder.com/go/internal/goldens"
)

func TestBlackScholesGolden(t *testing.T) {
	var g struct {
		ATMCall           float64 `json:"atmCall"`
		ATMPut            float64 `json:"atmPut"`
		DeepOTMCall       float64 `json:"deepOtmCall"`
		DeepITMCall       float64 `json:"deepItmCall"`
		ExpiredCall       float64 `json:"expiredCall"`
		ExpiredPut        float64 `json:"expiredPut"`
		VolFlat           float64 `json:"volFlat"`
		VolShort          float64 `json:"volShort"`
		ExpirationFriday  string  `json:"expirationFriday"`
		ExpirationOnFriday string `json:"expirationOnFriday"`
		Expiration2000    string  `json:"expiration2000"`
		Expiration1w      string  `json:"expiration1w"`
		YearsToMaturity   float64 `json:"yearsToMaturity"`
		YearsZero         float64 `json:"yearsZero"`
	}
	goldens.Load("blackscholes-samples.json", &g)
	if !goldens.MustAlmost(BlackScholes("call", 100, 100, 1, 0.05, 0.2), g.ATMCall, 1e-12) {
		t.Fatalf("atm call %v want %v", BlackScholes("call", 100, 100, 1, 0.05, 0.2), g.ATMCall)
	}
	if !goldens.MustAlmost(BlackScholes("put", 100, 100, 1, 0.05, 0.2), g.ATMPut, 1e-12) {
		t.Fatalf("atm put")
	}
	if !goldens.MustAlmost(BlackScholes("call", 50, 100, 0.1, 0.05, 0.2), g.DeepOTMCall, 1e-12) {
		t.Fatalf("otm %v", BlackScholes("call", 50, 100, 0.1, 0.05, 0.2))
	}
	if !goldens.MustAlmost(BlackScholes("call", 150, 100, 0.0001, 0.05, 0.2), g.DeepITMCall, 1e-12) {
		t.Fatalf("itm")
	}
	if v := BlackScholes("call", 100, 100, 1, 0, 0); math.IsNaN(v) || math.IsInf(v, 0) {
		t.Fatalf("sigma 0 must be finite, got %v", v)
	}
	if BlackScholes("call", 110, 100, 0, 0.05, 0.2) != g.ExpiredCall {
		t.Fatalf("expired call")
	}
	if BlackScholes("put", 90, 100, 0, 0.05, 0.2) != g.ExpiredPut {
		t.Fatalf("expired put")
	}
	flat := make([]float64, 30)
	for i := range flat {
		flat[i] = 100
	}
	if Volatility(flat, 30) != 0 || Volatility([]float64{100}, 30) != 0 {
		t.Fatal("vol")
	}
	if ExpirationDate("2023-01-01", 4) != g.ExpirationFriday {
		t.Fatalf("exp %s", ExpirationDate("2023-01-01", 4))
	}
	if ExpirationDate("2023-01-27", 4) != g.ExpirationOnFriday {
		t.Fatal("friday")
	}
	if ExpirationDate("2000-01-03", 4) != g.Expiration2000 {
		t.Fatal("2000")
	}
	if ExpirationDate("2024-12-31", 1) != g.Expiration1w {
		t.Fatal("1w")
	}
	if !goldens.MustAlmost(YearsToMaturity("2023-01-01", "2024-01-01"), g.YearsToMaturity, 1e-12) {
		t.Fatalf("ytm %v", YearsToMaturity("2023-01-01", "2024-01-01"))
	}
	if YearsToMaturity("2024-03-15", "2024-03-15") != 0 {
		t.Fatal("zero")
	}
}
