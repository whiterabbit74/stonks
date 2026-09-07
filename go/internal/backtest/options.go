package backtest

import (
	"math"
	"sort"
	"strings"

	"mktorder.com/go/internal/optionsmath"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type OptionsConfig struct {
	StrikePct       float64  `json:"strikePct"`
	VolAdjPct       float64  `json:"volAdjPct"`
	CapitalPct      float64  `json:"capitalPct"`
	InitialCapital  float64  `json:"initialCapital"`
	RiskFreeRate    *float64 `json:"riskFreeRate"`
	ExpirationWeeks *int     `json:"expirationWeeks"`
	MaxHoldingDays  *int     `json:"maxHoldingDays"`
}

type optionsResolved struct {
	StrikePct       float64
	VolAdjPct       float64
	CapitalPct      float64
	RiskFreeRate    float64
	ExpirationWeeks int
	MaxHoldingDays  int
}

const contractMultiplier = 100

// executionPrice receives dollars per share and returns dollars per contract.
// The contract multiplier is 100 shares.
func executionPrice(theoretical float64) float64 {
	if theoretical < 0.005 {
		return 0
	}
	raw := theoretical * contractMultiplier
	if theoretical < 3.00 {
		return math.Round(raw)
	}
	return math.Round(raw/5) * 5
}

func optionsInitial(c OptionsConfig) float64 {
	if c.InitialCapital > 0 {
		return c.InitialCapital
	}
	return 10000
}

func (c OptionsConfig) resolve() optionsResolved {
	return optionsResolved{
		StrikePct:       c.StrikePct,
		VolAdjPct:       c.VolAdjPct,
		CapitalPct:      c.CapitalPct,
		RiskFreeRate:    types.F64Or(c.RiskFreeRate, 0.05),
		ExpirationWeeks: types.IntOr(c.ExpirationWeeks, 4),
		MaxHoldingDays:  types.IntOr(c.MaxHoldingDays, 30),
	}
}

func rf(date string, fallback float64) float64 {
	if v, ok := optionsmath.RiskFreeRate(date); ok {
		return v
	}
	return fallback
}

func cloneContext(ctx *types.TradeContext) *types.TradeContext {
	if ctx == nil {
		return nil
	}
	c := *ctx
	if ctx.IndicatorValues != nil {
		m := make(map[string]float64, len(ctx.IndicatorValues))
		for k, v := range ctx.IndicatorValues {
			m[k] = v
		}
		c.IndicatorValues = m
	}
	if ctx.EntryRawClose != nil {
		v := *ctx.EntryRawClose
		c.EntryRawClose = &v
	}
	if ctx.ExitRawClose != nil {
		v := *ctx.ExitRawClose
		c.ExitRawClose = &v
	}
	return &c
}

func cloneTrades(in []types.Trade) []types.Trade {
	out := make([]types.Trade, len(in))
	for i, t := range in {
		t.Context = cloneContext(t.Context)
		out[i] = t
	}
	return out
}

func RunMultiOptions(stockTrades []types.Trade, tickers []TickerIndexed, raw OptionsConfig) (equity []types.EquityPoint, trades []types.Trade, finalValue float64) {
	stockTrades = cloneTrades(stockTrades)
	tickers = IndexTickers(tickers)
	cfg := raw.resolve()
	initial := optionsInitial(raw)
	type daily struct {
		close float64
		index int
		vol   float64
	}
	tickerMaps := map[string]map[string]daily{}
	allDates := map[string]struct{}{}
	for _, td := range tickers {
		dateMap := map[string]daily{}
		ticker := strings.ToUpper(td.Ticker)
		for idx, bar := range td.Data {
			ds := tradingdate.DateKey(bar.Date)
			allDates[ds] = struct{}{}
			start := idx - 30
			if start < 0 {
				start = 0
			}
			prices := make([]float64, 0, idx-start+1)
			for i := start; i <= idx; i++ {
				prices = append(prices, td.Data[i].Close)
			}
			vol := optionsmath.Volatility(prices, 30) * (1 + cfg.VolAdjPct/100)
			dateMap[ds] = daily{close: bar.Close, index: idx, vol: vol}
		}
		tickerMaps[ticker] = dateMap
	}
	sorted := make([]string, 0, len(allDates))
	for d := range allDates {
		sorted = append(sorted, d)
	}
	sort.Strings(sorted)

	currentCapital := initial
	portfolioValue := initial
	var active []types.Trade

	for _, dateStr := range sorted {
		r := rf(dateStr, cfg.RiskFreeRate)
		for i := len(active) - 1; i >= 0; i-- {
			trade := &active[i]
			ticker := ""
			if trade.Context != nil {
				ticker = strings.ToUpper(trade.Context.Ticker)
			}
			marketMap := tickerMaps[ticker]
			md, ok := marketMap[dateStr]
			if !ok {
				continue
			}
			spot := md.close
			T := optionsmath.YearsToMaturity(dateStr, trade.ExpirationDate)
			vol := md.vol
			theoretical := optionsmath.BlackScholes("call", spot, trade.Strike, T, r, vol)
			optPrice := executionPrice(theoretical)
			tExit := tradingdate.DateKey(trade.ExitDate)
			entryStr := tradingdate.DateKey(trade.EntryDate)
			daysHeld := tradingdate.DaysBetween(entryStr, dateStr)
			isMaxHold := daysHeld >= cfg.MaxHoldingDays
			isExpired := T <= 0
			isStockExit := dateStr == tExit || (tExit != "" && dateStr > tExit)
			if isStockExit || isExpired || isMaxHold {
				if isExpired {
					intrinsic := math.Max(0, spot-trade.Strike)
					optPrice = executionPrice(intrinsic)
					trade.ExitReason = "option_expired"
				} else if isMaxHold && !isStockExit {
					trade.ExitReason = "max_hold"
					trade.ExitDate = dateStr
				}
				trade.OptionExitPrice = optPrice
				trade.ImpliedVolAtExit = vol
				trade.ExitPrice = spot
				proceeds := trade.Contracts * optPrice
				cost := trade.Contracts * trade.OptionEntryPrice
				pnl := proceeds - cost
				trade.PnL = pnl
				trade.PnLPercent = (pnl / cost) * 100
				trade.Duration = daysHeld
				currentCapital += proceeds
				if trade.Context == nil {
					trade.Context = &types.TradeContext{}
				}
				trade.Context.CurrentCapitalAfterExit = currentCapital
				trade.Context.InitialInvestment = cost
				trade.Context.GrossInvestment = cost
				trade.Context.MarginUsed = cost
				trade.Context.NetProceeds = proceeds
				trades = append(trades, *trade)
				active = append(active[:i], active[i+1:]...)
			}
		}

		for _, stockTrade := range stockTrades {
			if tradingdate.DateKey(stockTrade.EntryDate) != dateStr {
				continue
			}
			ticker := ""
			if stockTrade.Context != nil {
				ticker = strings.ToUpper(stockTrade.Context.Ticker)
			}
			md, ok := tickerMaps[ticker][dateStr]
			if !ok || md.vol <= 0 {
				continue
			}
			spot := md.close
			// Упрощение: страйк округляется до $1.
			strike := math.Round(spot * (1 + cfg.StrikePct/100))
			expiration := optionsmath.ExpirationDate(dateStr, cfg.ExpirationWeeks)
			T := optionsmath.YearsToMaturity(dateStr, expiration)
			theoretical := optionsmath.BlackScholes("call", spot, strike, T, r, md.vol)
			optPrice := executionPrice(theoretical)
			if optPrice > 0 {
				invest := currentCapital * (cfg.CapitalPct / 100)
				contracts := math.Floor(invest / optPrice)
				if contracts >= 1 {
					t := stockTrade
					t.OptionType = "call"
					t.Strike = strike
					t.ExpirationDate = expiration
					t.ImpliedVolAtEntry = md.vol
					t.OptionEntryPrice = optPrice
					t.Contracts = contracts
					t.EntryPrice = spot
					t.Quantity = contracts
					currentCapital -= contracts * optPrice
					active = append(active, t)
				}
			}
		}

		openVal := 0.0
		for _, trade := range active {
			ticker := ""
			if trade.Context != nil {
				ticker = strings.ToUpper(trade.Context.Ticker)
			}
			md, ok := tickerMaps[ticker][dateStr]
			if !ok {
				continue
			}
			T := optionsmath.YearsToMaturity(dateStr, trade.ExpirationDate)
			theoretical := optionsmath.BlackScholes("call", md.close, trade.Strike, T, r, md.vol)
			openVal += trade.Contracts * executionPrice(theoretical)
		}
		portfolioValue = currentCapital + openVal
		equity = append(equity, types.EquityPoint{Date: dateStr, Value: portfolioValue, Drawdown: 0})
	}
	// Открытые на конец истории опционы закрываются по теоретической цене
	// последнего дня, как во всех остальных движках: иначе они выпадали из
	// trades и портили TotalTrades с WinRate (AUD-049).
	if len(sorted) > 0 {
		lastDate := sorted[len(sorted)-1]
		r := rf(lastDate, cfg.RiskFreeRate)
		for i := range active {
			trade := &active[i]
			ticker := ""
			if trade.Context != nil {
				ticker = strings.ToUpper(trade.Context.Ticker)
			}
			md, ok := tickerMaps[ticker][lastDate]
			if !ok {
				continue
			}
			T := optionsmath.YearsToMaturity(lastDate, trade.ExpirationDate)
			optPrice := executionPrice(optionsmath.BlackScholes("call", md.close, trade.Strike, T, r, md.vol))
			proceeds := trade.Contracts * optPrice
			cost := trade.Contracts * trade.OptionEntryPrice
			pnl := proceeds - cost
			trade.ExitReason = "end_of_data"
			trade.ExitDate = lastDate
			trade.OptionExitPrice = optPrice
			trade.ImpliedVolAtExit = md.vol
			trade.ExitPrice = md.close
			trade.PnL = pnl
			trade.PnLPercent = (pnl / cost) * 100
			trade.Duration = tradingdate.DaysBetween(tradingdate.DateKey(trade.EntryDate), lastDate)
			currentCapital += proceeds
			if trade.Context == nil {
				trade.Context = &types.TradeContext{}
			}
			trade.Context.CurrentCapitalAfterExit = currentCapital
			trade.Context.InitialInvestment = cost
			trade.Context.GrossInvestment = cost
			trade.Context.MarginUsed = cost
			trade.Context.NetProceeds = proceeds
			trades = append(trades, *trade)
		}
	}
	applyDrawdown(equity, initial)
	finalValue = portfolioValue
	return
}
