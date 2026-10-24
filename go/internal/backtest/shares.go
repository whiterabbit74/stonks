package backtest

import (
	"math"

	"mktorder.com/go/internal/types"
)

// wholeShares is how many shares a simulator may buy: never a fraction.
func wholeShares(n float64) float64 {
	if n < 1 || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0
	}
	return math.Floor(n)
}

// affordableShares — сколько целых акций по price купить на budget (стоимость
// позиции), чтобы залог cost/leverage вместе с комиссией влез в cash.
// Комиссия линейна по стоимости (fixed + percentage), поэтому количество
// считается формулой. Перебор по одной акции на больших float64 зацикливался:
// q-1 == q (AUD-144); досчёт ниже — только поправка на округление.
func affordableShares(budget, cash, price, leverage float64, strategy types.Strategy) float64 {
	if !(price > 0) || !(leverage > 0) {
		return 0
	}
	fixed, rate := 0.0, 0.0
	c := strategy.RiskManagement.Commission
	switch c.Type {
	case "fixed":
		fixed = c.Fixed
	case "percentage":
		rate = c.Percentage / 100
	case "combined":
		fixed, rate = c.Fixed, c.Percentage/100
	}
	q := wholeShares(budget / price)
	if perShare := price * (1/leverage + rate); perShare > 0 {
		q = math.Min(q, wholeShares((cash-fixed)/perShare))
	}
	for q > 0 {
		cost := q * price
		need := cost/leverage + commission(cost, strategy)
		if need > 0 && cash >= need {
			return q
		}
		if q-1 == q {
			return 0
		}
		q--
	}
	return 0
}
