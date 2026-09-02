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
	StrikePct       float64 `json:"strikePct"`
	VolAdjPct       float64 `json:"volAdjPct"`
	CapitalPct      float64 `json:"capitalPct"`
	RiskFreeRate    float64 `json:"riskFreeRate"`
	ExpirationWeeks int     `json:"expirationWeeks"`
	MaxHoldingDays  int     `json:"maxHoldingDays"`
}

func executionPrice(theoretical float64) float64 {
	if theoretical < 0.005 {
		return 0
	}
	raw := theoretical * 100
	if theoretical < 3.00 {
		return math.Round(raw)
	}
	return math.Round(raw/5) * 5
}

func (c OptionsConfig) defaults() OptionsConfig {
	if c.RiskFreeRate == 0 {
		c.RiskFreeRate = 0.05
	}
	if c.ExpirationWeeks == 0 {
		c.ExpirationWeeks = 4
	}
	if c.MaxHoldingDays == 0 {
		c.MaxHoldingDays = 30
	}
	return c
}

func rf(date string, fallback float64) float64 {
	if v, ok := optionsmath.RiskFreeRate(date); ok {
		return v
	}
	return fallback
}

type marketState struct {
	close float64
	index int
	vol   float64
}

func RunOptions(stockTrades []types.Trade, market []types.OHLC, cfg OptionsConfig) (equity []types.EquityPoint, trades []types.Trade, finalValue float64) {
	cfg = cfg.defaults()
	initial := 10000.0
	datePrice := map[string]marketState{}
	for idx, bar := range market {
		datePrice[tradingdate.DateKey(bar.Date)] = marketState{close: bar.Close, index: idx}
	}
	getState := func(dateStr string) (marketState, bool) {
		entry, ok := datePrice[dateStr]
		if !ok {
			return marketState{}, false
		}
		windowSize := 30
		start := entry.index - windowSize
		if start < 0 {
			start = 0
		}
		prices := make([]float64, 0, entry.index-start+1)
		for i := start; i <= entry.index; i++ {
			prices = append(prices, market[i].Close)
		}
		vol := optionsmath.Volatility(prices, windowSize)
		vol = vol * (1 + cfg.VolAdjPct/100)
		entry.vol = vol
		return entry, true
	}

	currentCapital := initial
	portfolioValue := initial
	var active *types.Trade

	for i := 0; i < len(market); i++ {
		bar := market[i]
		dateStr := tradingdate.DateKey(bar.Date)
		r := rf(dateStr, cfg.RiskFreeRate)

		if active == nil {
			var matching *types.Trade
			for j := range stockTrades {
				if tradingdate.DateKey(stockTrades[j].EntryDate) == dateStr {
					matching = &stockTrades[j]
					break
				}
			}
			if matching != nil {
				if state, ok := getState(dateStr); ok && state.vol > 0 {
					spot := state.close
					strike := math.Round(spot * (1 + cfg.StrikePct/100))
					expiration := optionsmath.ExpirationDate(dateStr, cfg.ExpirationWeeks)
					T := optionsmath.YearsToMaturity(dateStr, expiration)
					theoretical := optionsmath.BlackScholes("call", spot, strike, T, r, state.vol)
					optPrice := executionPrice(theoretical)
					if optPrice > 0 {
						invest := currentCapital * (cfg.CapitalPct / 100)
						contracts := math.Floor(invest / optPrice)
						if contracts >= 1 {
							t := *matching
							t.OptionType = "call"
							t.Strike = strike
							t.ExpirationDate = expiration
							t.ImpliedVolAtEntry = state.vol
							t.OptionEntryPrice = optPrice
							t.Contracts = contracts
							t.EntryPrice = spot
							t.Quantity = contracts
							active = &t
							currentCapital -= contracts * optPrice
						}
					}
				}
			}
		}

		if active != nil {
			if state, ok := getState(dateStr); ok {
				spot := state.close
				expiration := active.ExpirationDate
				T := optionsmath.YearsToMaturity(dateStr, expiration)
				vol := state.vol
				theoretical := optionsmath.BlackScholes("call", spot, active.Strike, T, r, vol)
				optPrice := executionPrice(theoretical)
				portfolioValue = currentCapital + (active.Contracts * optPrice)
				tExit := tradingdate.DateKey(active.ExitDate)
				entryStr := tradingdate.DateKey(active.EntryDate)
				daysHeld := tradingdate.DaysBetween(entryStr, dateStr)
				isMaxHold := daysHeld >= cfg.MaxHoldingDays
				isExpired := T <= 0
				isStockExit := dateStr == tExit
				if isStockExit || isExpired || isMaxHold {
					if isExpired {
						intrinsic := math.Max(0, spot-active.Strike)
						optPrice = executionPrice(intrinsic)
						active.ExitReason = "option_expired"
					} else if isMaxHold && !isStockExit {
						active.ExitReason = "max_hold"
						active.ExitDate = dateStr
					}
					active.OptionExitPrice = optPrice
					active.ImpliedVolAtExit = vol
					active.ExitPrice = spot
					proceeds := active.Contracts * optPrice
					cost := active.Contracts * active.OptionEntryPrice
					pnl := proceeds - cost
					active.PnL = pnl
					active.PnLPercent = (pnl / cost) * 100
					active.Duration = daysHeld
					currentCapital += proceeds
					if active.Context == nil {
						active.Context = &types.TradeContext{}
					}
					active.Context.CurrentCapitalAfterExit = currentCapital
					active.Context.InitialInvestment = cost
					active.Context.GrossInvestment = cost
					active.Context.MarginUsed = cost
					active.Context.NetProceeds = proceeds
					trades = append(trades, *active)
					active = nil
				}
			}
		} else {
			portfolioValue = currentCapital
		}
		equity = append(equity, types.EquityPoint{Date: dateStr, Value: portfolioValue, Drawdown: 0})
	}

	applyDrawdown(equity, initial)
	finalValue = portfolioValue
	return
}

func RunMultiOptions(stockTrades []types.Trade, tickers []TickerIndexed, cfg OptionsConfig) (equity []types.EquityPoint, trades []types.Trade, finalValue float64) {
	cfg = cfg.defaults()
	initial := 10000.0
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
			isStockExit := dateStr == tExit
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
	applyDrawdown(equity, initial)
	finalValue = portfolioValue
	return
}
