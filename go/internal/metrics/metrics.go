package metrics

import (
	"math"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

const TradePnLEpsilon = 0.01

type Calculator struct {
	trades         []types.Trade
	equity         []types.EquityPoint
	initialCapital float64
	benchmark      []types.OHLC
	cachedAvgWin   *float64
	cachedAvgLoss  *float64
}

func New(trades []types.Trade, equity []types.EquityPoint, initialCapital float64, benchmark []types.OHLC) *Calculator {
	return &Calculator{trades: trades, equity: equity, initialCapital: initialCapital, benchmark: benchmark}
}

func (c *Calculator) All() types.PerformanceMetrics {
	returns := c.returns()
	finalValue := c.finalValue()
	years := c.tradingPeriodYears()
	meanReturn := mean(returns)
	cagr := c.cagr(finalValue, years)
	beta := c.beta(returns, meanReturn)
	maxDD := c.maxDrawdown()
	totalReturn := c.totalReturn(finalValue)
	pf := c.profitFactor()
	rf := c.recoveryFactor(totalReturn, maxDD)
	return types.PerformanceMetrics{
		TotalReturn:    totalReturn,
		CAGR:           cagr,
		MaxDrawdown:    maxDD,
		WinRate:        c.winRate(),
		TotalTrades:    len(c.trades),
		SharpeRatio:    c.sharpe(returns, meanReturn),
		SortinoRatio:   c.sortino(returns, meanReturn),
		CalmarRatio:    c.calmar(cagr, maxDD),
		ProfitFactor:   pf,
		AverageWin:     c.averageWin(),
		AverageLoss:    c.averageLoss(),
		Beta:           beta,
		Alpha:          c.alpha(cagr, beta),
		RecoveryFactor: rf,
		Skewness:       c.skewness(returns, meanReturn),
		Kurtosis:       c.kurtosis(returns, meanReturn),
		ValueAtRisk:    c.var5(returns),
	}
}

func (c *Calculator) totalReturn(finalValue float64) float64 {
	if c.initialCapital <= 0 {
		return 0
	}
	return ((finalValue - c.initialCapital) / c.initialCapital) * 100
}

func (c *Calculator) cagr(finalValue, years float64) float64 {
	if c.initialCapital <= 0 || years <= 0 {
		return 0
	}
	if years < 1 {
		return ((finalValue - c.initialCapital) / c.initialCapital) * 100
	}
	return (math.Pow(finalValue/c.initialCapital, 1/years) - 1) * 100
}

func (c *Calculator) maxDrawdown() float64 {
	maxDD := 0.0
	for _, p := range c.equity {
		if p.Drawdown > maxDD {
			maxDD = p.Drawdown
		}
	}
	return maxDD
}

func (c *Calculator) winRate() float64 {
	if len(c.trades) == 0 {
		return 0
	}
	wins := 0
	for _, t := range c.trades {
		if t.PnL > TradePnLEpsilon {
			wins++
		}
	}
	return (float64(wins) / float64(len(c.trades))) * 100
}

func (c *Calculator) sharpe(returns []float64, meanReturn float64) float64 {
	if len(returns) == 0 {
		return 0
	}
	stdDev := stdPop(returns, meanReturn)
	if stdDev == 0 {
		return 0
	}
	annualizedReturn := meanReturn * 252
	annualizedStd := stdDev * math.Sqrt(252)
	return (annualizedReturn - 0.02) / annualizedStd
}

func (c *Calculator) sortino(returns []float64, meanReturn float64) float64 {
	if len(returns) == 0 {
		return 0
	}
	annualizedReturn := meanReturn * 252
	riskFreeAnnual := 0.02
	marDaily := riskFreeAnnual / 252
	down := downwardDev(returns, marDaily)
	if down == 0 {
		return 0
	}
	return (annualizedReturn - riskFreeAnnual) / (down * math.Sqrt(252))
}

func (c *Calculator) calmar(cagr, maxDD float64) float64 {
	if maxDD == 0 {
		return 0
	}
	return cagr / maxDD
}

func (c *Calculator) profitFactor() float64 {
	var gp, gl float64
	for _, t := range c.trades {
		if t.PnL > TradePnLEpsilon {
			gp += t.PnL
		} else if t.PnL < -TradePnLEpsilon {
			gl += math.Abs(t.PnL)
		}
	}
	if gl == 0 {
		if gp > 0 {
			return math.Inf(1)
		}
		return 0
	}
	return gp / gl
}

func (c *Calculator) averageWin() float64 {
	if c.cachedAvgWin != nil {
		return *c.cachedAvgWin
	}
	var total float64
	n := 0
	for _, t := range c.trades {
		if t.PnL > TradePnLEpsilon {
			total += t.PnL
			n++
		}
	}
	v := 0.0
	if n > 0 {
		v = total / float64(n)
	}
	c.cachedAvgWin = &v
	return v
}

func (c *Calculator) averageLoss() float64 {
	if c.cachedAvgLoss != nil {
		return *c.cachedAvgLoss
	}
	var total float64
	n := 0
	for _, t := range c.trades {
		if t.PnL < -TradePnLEpsilon {
			total += math.Abs(t.PnL)
			n++
		}
	}
	v := 0.0
	if n > 0 {
		v = total / float64(n)
	}
	c.cachedAvgLoss = &v
	return v
}

func (c *Calculator) beta(returns []float64, returnsMean float64) float64 {
	if len(c.benchmark) == 0 || len(returns) == 0 {
		return 1.0
	}
	br := c.benchmarkReturns()
	if len(br) != len(returns) {
		return 1.0
	}
	bm := mean(br)
	cov := covariance(returns, br, returnsMean, bm)
	bv := variancePop(br, bm)
	if bv == 0 {
		return 1.0
	}
	return cov / bv
}

func (c *Calculator) alpha(cagr, beta float64) float64 {
	return cagr - (2 + beta*(8-2))
}

func (c *Calculator) recoveryFactor(totalReturn, maxDD float64) float64 {
	if maxDD == 0 {
		if totalReturn > 0 {
			return math.Inf(1)
		}
		return 0
	}
	return totalReturn / maxDD
}

func (c *Calculator) skewness(returns []float64, m float64) float64 {
	if len(returns) < 3 {
		return 0
	}
	sd := stdPop(returns, m)
	if sd == 0 {
		return 0
	}
	s := 0.0
	for _, r := range returns {
		s += math.Pow((r-m)/sd, 3)
	}
	return s / float64(len(returns))
}

func (c *Calculator) kurtosis(returns []float64, m float64) float64 {
	if len(returns) < 4 {
		return 0
	}
	sd := stdPop(returns, m)
	if sd == 0 {
		return 0
	}
	s := 0.0
	for _, r := range returns {
		s += math.Pow((r-m)/sd, 4)
	}
	return s/float64(len(returns)) - 3
}

func (c *Calculator) var5(returns []float64) float64 {
	if len(returns) == 0 {
		return 0
	}
	sorted := append([]float64(nil), returns...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j] < sorted[i] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	idx := int(math.Floor(float64(len(returns)) * 0.05))
	v := 0.0
	if idx < len(sorted) {
		v = sorted[idx]
	}
	return math.Abs(v) * 100
}

func (c *Calculator) returns() []float64 {
	var out []float64
	for i := 1; i < len(c.equity); i++ {
		prev := c.equity[i-1].Value
		cur := c.equity[i].Value
		if prev > 0 {
			out = append(out, (cur-prev)/prev)
		}
	}
	return out
}

func (c *Calculator) finalValue() float64 {
	if len(c.equity) == 0 {
		return c.initialCapital
	}
	return c.equity[len(c.equity)-1].Value
}

func (c *Calculator) tradingPeriodYears() float64 {
	if len(c.equity) < 2 {
		return 1 / 365.25
	}
	start, end := c.equity[0].Date, c.equity[len(c.equity)-1].Date
	if start == "" || end == "" {
		return 1 / 365.25
	}
	days := tradingdate.DaysBetween(start, end)
	if days < 1 {
		days = 1
	}
	return float64(days) / 365.25
}

func (c *Calculator) benchmarkReturns() []float64 {
	if len(c.benchmark) < 2 {
		return nil
	}
	var out []float64
	for i := 1; i < len(c.benchmark); i++ {
		prev := c.benchmark[i-1].Close
		cur := c.benchmark[i].Close
		if prev > 0 {
			out = append(out, (cur-prev)/prev)
		}
	}
	return out
}

func mean(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s / float64(len(v))
}

func stdPop(v []float64, m float64) float64 {
	return math.Sqrt(variancePop(v, m))
}

func variancePop(v []float64, m float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range v {
		d := x - m
		s += d * d
	}
	return s / float64(len(v))
}

func covariance(a, b []float64, ma, mb float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	s := 0.0
	for i := range a {
		s += (a[i] - ma) * (b[i] - mb)
	}
	return s / float64(len(a))
}

func downwardDev(returns []float64, marDaily float64) float64 {
	var squares []float64
	for _, r := range returns {
		if r < marDaily {
			d := r - marDaily
			squares = append(squares, d*d)
		}
	}
	if len(squares) == 0 {
		return 0
	}
	s := 0.0
	for _, v := range squares {
		s += v
	}
	return math.Sqrt(s / float64(len(squares)))
}

func CAGR(finalValue, initialValue float64, startDate, endDate string) float64 {
	if initialValue <= 0 {
		return 0
	}
	years := float64(tradingdate.DaysBetween(startDate, endDate)) / 365.25
	if years <= 0 {
		return 0
	}
	return (math.Pow(finalValue/initialValue, 1/years) - 1) * 100
}

type TradeStats struct {
	TotalTrades int
	Wins        int
	Losses      int
	Breakeven   int
	TotalPnL    float64
	GrossProfit float64
	GrossLoss   float64
	ProfitFactor float64
	WinRate     float64
	AvgDuration float64
}

func CalculateTradeStats(trades []types.Trade) TradeStats {
	st := TradeStats{TotalTrades: len(trades)}
	var totalDuration float64
	for _, t := range trades {
		pnl := t.PnL
		if pnl > TradePnLEpsilon {
			st.Wins++
			st.GrossProfit += pnl
		} else if pnl < -TradePnLEpsilon {
			st.Losses++
			st.GrossLoss += math.Abs(pnl)
		}
		st.TotalPnL += pnl
		totalDuration += float64(t.Duration)
	}
	if st.TotalTrades > 0 {
		st.WinRate = (float64(st.Wins) / float64(st.TotalTrades)) * 100
		st.AvgDuration = totalDuration / float64(st.TotalTrades)
	}
	st.Breakeven = st.TotalTrades - st.Wins - st.Losses
	if st.GrossLoss != 0 {
		st.ProfitFactor = st.GrossProfit / st.GrossLoss
	} else if st.GrossProfit > 0 {
		st.ProfitFactor = math.Inf(1)
	}
	return st
}

func BacktestMetrics(trades []types.Trade, equity []types.EquityPoint, initialCapital float64, contribTotal float64, contribCount int) types.BacktestMetrics {
	st := CalculateTradeStats(trades)
	finalValue := initialCapital
	if len(equity) > 0 {
		finalValue = equity[len(equity)-1].Value
	}
	netProfit := finalValue - initialCapital - contribTotal
	totalInvested := initialCapital + contribTotal
	netReturn := 0.0
	if totalInvested > 0 {
		netReturn = (netProfit / totalInvested) * 100
	}
	cagr := 0.0
	if len(equity) >= 2 {
		days := float64(tradingdate.DaysBetween(equity[0].Date, equity[len(equity)-1].Date))
		years := days / 365.25
		if years < 0.1 {
			years = 0.1
		}
		if finalValue > 0 && initialCapital > 0 {
			cagr = (math.Pow(finalValue/initialCapital, 1/years) - 1) * 100
		}
	}
	maxDD := 0.0
	for _, p := range equity {
		if p.Drawdown > maxDD {
			maxDD = p.Drawdown
		}
	}
	return types.BacktestMetrics{
		TotalReturn: netReturn, CAGR: cagr, WinRate: st.WinRate,
		TotalTrades: st.TotalTrades, WinningTrades: st.Wins, LosingTrades: st.Losses,
		ProfitFactor: st.ProfitFactor, NetProfit: netProfit, NetReturn: netReturn,
		MaxDrawdown: maxDD, TotalContribution: contribTotal, ContributionCount: contribCount,
	}
}

func NormalizeTakeProfitPercent(value *float64) *float64 {
	if value == nil || !isFinite(*value) || *value <= 0 {
		return nil
	}
	v := *value
	return &v
}

func TakeProfitPrice(entryPrice float64, takeProfitPercent *float64) *float64 {
	if takeProfitPercent == nil {
		return nil
	}
	v := entryPrice * (1 + *takeProfitPercent/100)
	return &v
}

func ShouldTakeProfit(barHigh float64, takeProfitPrice *float64) bool {
	return takeProfitPrice != nil && isFinite(barHigh) && barHigh >= *takeProfitPrice
}

func ExposurePct(positionValue, equity float64) float64 {
	if !isFinite(positionValue) || !isFinite(equity) || equity <= 0 {
		return 0
	}
	return (positionValue / equity) * 100
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func SimulateLeverage(equity []types.EquityPoint, leverage float64) (out []types.EquityPoint, finalValue, maxDrawdown float64) {
	if len(equity) == 0 || leverage <= 0 {
		return nil, 0, 0
	}
	current := equity[0].Value
	peak := current
	maxDD := 0.0
	out = append(out, types.EquityPoint{Date: equity[0].Date, Value: current, Drawdown: 0})
	for i := 1; i < len(equity); i++ {
		basePrev := equity[i-1].Value
		baseCurr := equity[i].Value
		if basePrev <= 0 {
			continue
		}
		current = current * (1 + ((baseCurr-basePrev)/basePrev)*leverage)
		if current < 0 {
			current = 0
		}
		if current > peak {
			peak = current
		}
		dd := 0.0
		if peak > 0 {
			dd = ((peak - current) / peak) * 100
		}
		if dd > maxDD {
			maxDD = dd
		}
		out = append(out, types.EquityPoint{Date: equity[i].Date, Value: current, Drawdown: dd})
	}
	finalValue = current
	if len(out) > 0 {
		finalValue = out[len(out)-1].Value
	}
	return out, finalValue, maxDD
}
