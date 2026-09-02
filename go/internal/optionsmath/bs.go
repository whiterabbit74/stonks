package optionsmath

import (
	_ "embed"
	"encoding/json"
	"math"

	"mktorder.com/go/internal/tradingdate"
)

// Abramowitz–Stegun CND coefficients — copied from src/lib/optionsMath.ts. Do not swap in erfc.
func cnd(x float64) float64 {
	const (
		a1 = 0.31938153
		a2 = -0.356563782
		a3 = 1.781477937
		a4 = -1.821255978
		a5 = 1.330274429
		p  = 0.2316419
	)
	absX := math.Abs(x)
	t := 1.0 / (1.0 + p*absX)
	y := 1.0 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*math.Exp(-x*x/2.0)/math.Sqrt(2*math.Pi)
	if x < 0 {
		return 1 - y
	}
	return y
}

func BlackScholes(typ string, S, K, T, r, sigma float64) float64 {
	if T <= 0 {
		if typ == "call" {
			return math.Max(0, S-K)
		}
		return math.Max(0, K-S)
	}
	d1 := (math.Log(S/K) + (r+(sigma*sigma)/2.0)*T) / (sigma * math.Sqrt(T))
	d2 := d1 - sigma*math.Sqrt(T)
	if typ == "call" {
		return S*cnd(d1) - K*math.Exp(-r*T)*cnd(d2)
	}
	return K*math.Exp(-r*T)*cnd(-d2) - S*cnd(-d1)
}

func Volatility(prices []float64, _window int) float64 {
	if len(prices) < 3 {
		return 0
	}
	returns := make([]float64, 0, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		returns = append(returns, math.Log(prices[i]/prices[i-1]))
	}
	if len(returns) < 2 {
		return 0
	}
	mean := 0.0
	for _, r := range returns {
		mean += r
	}
	mean /= float64(len(returns))
	variance := 0.0
	for _, r := range returns {
		d := r - mean
		variance += d * d
	}
	variance /= float64(len(returns) - 1)
	stdDev := math.Sqrt(variance)
	return stdDev * math.Sqrt(252)
}

func ExpirationDate(fromDate string, weeks int) string {
	target := tradingdate.AddDays(fromDate, weeks*7)
	day := tradingdate.DayOfWeek(target)
	daysToAdd := (5 - day + 7) % 7
	return tradingdate.AddDays(target, daysToAdd)
}

func YearsToMaturity(fromDate, toDate string) float64 {
	return float64(tradingdate.DaysBetween(fromDate, toDate)) / 365.25
}

//go:embed rates.json
var ratesJSON []byte

var rates map[string]float64

func init() {
	_ = json.Unmarshal(ratesJSON, &rates)
}

func RiskFreeRate(date string) (float64, bool) {
	if len(date) < 7 {
		return 0, false
	}
	v, ok := rates[date[:7]]
	return v, ok
}
