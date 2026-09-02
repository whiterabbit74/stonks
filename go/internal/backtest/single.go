package backtest

import (
	"fmt"
	"math"
	"sort"

	ibssig "mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type TickerIndexed struct {
	Ticker       string
	Data         []types.OHLC
	IBSValues    []float64
	DateIndexMap map[string]int
}

func IndexTickers(in []TickerIndexed) []TickerIndexed {
	out := make([]TickerIndexed, len(in))
	for i, t := range in {
		m := make(map[string]int, len(t.Data))
		for idx, bar := range t.Data {
			m[bar.Date] = idx
		}
		out[i] = t
		out[i].DateIndexMap = m
	}
	return out
}

func unionDates(tickers []TickerIndexed) []string {
	dateSet := map[string]struct{}{}
	for _, t := range tickers {
		for _, bar := range t.Data {
			dateSet[bar.Date] = struct{}{}
		}
	}
	sorted := make([]string, 0, len(dateSet))
	for d := range dateSet {
		sorted = append(sorted, d)
	}
	sort.Strings(sorted)
	return sorted
}

func ibsParams(strategy types.Strategy) (low, high, maxHold, initial float64) {
	low = strategy.Parameters.LowIBS
	if low == 0 {
		low = 0.1
	}
	high = strategy.Parameters.HighIBS
	if high == 0 {
		high = 0.75
	}
	maxHold = strategy.Parameters.MaxHoldDays
	if maxHold == 0 {
		maxHold = 30
	}
	initial = strategy.RiskManagement.InitialCapital
	if initial == 0 {
		initial = 10000
	}
	return
}

func applyDrawdown(equity []types.EquityPoint, initial float64) {
	peak := initial
	for i := range equity {
		if equity[i].Value > peak {
			peak = equity[i].Value
		}
		if peak > 0 {
			equity[i].Drawdown = ((peak - equity[i].Value) / peak) * 100
		}
	}
}

func commission(tradeValue float64, strategy types.Strategy) float64 {
	c := strategy.RiskManagement.Commission
	switch c.Type {
	case "fixed":
		return c.Fixed
	case "percentage":
		return tradeValue * (c.Percentage / 100)
	case "combined":
		return c.Fixed + tradeValue*(c.Percentage/100)
	default:
		return 0
	}
}

type singlePos struct {
	ticker          string
	entryDate       string
	entryPrice      float64
	quantity        float64
	entryIndex      int
	totalCost       float64
	entryCommission float64
	entryIBS        float64
}

type SingleOptions struct {
	AllowSameDayReentry bool     `json:"allowSameDayReentry"`
	MonthlyAmount       float64  `json:"monthlyAmount"`
	MonthlyDayOfMonth   int      `json:"monthlyDayOfMonth"`
	MonthlyStartDate    string   `json:"monthlyStartDate"`
	TakeProfitPercent   *float64 `json:"takeProfitPercent"`
}

func RunSinglePosition(tickers []TickerIndexed, strategy types.Strategy, leverage float64, opt SingleOptions) (equity []types.EquityPoint, finalValue, maxDrawdown float64, trades []types.Trade, m types.BacktestMetrics, exposure []types.ExposurePoint) {
	if leverage == 0 {
		leverage = 1
	}
	tickers = IndexTickers(tickers)
	if len(tickers) == 0 {
		return nil, 0, 0, nil, types.BacktestMetrics{}, nil
	}
	lowIBS, highIBS, maxHoldDays, initial := ibsParams(strategy)
	var tp *float64
	if opt.TakeProfitPercent != nil {
		tp = metrics.NormalizeTakeProfitPercent(opt.TakeProfitPercent)
	} else if strategy.RiskManagement.UseTakeProfit {
		v := strategy.RiskManagement.TakeProfit
		tp = metrics.NormalizeTakeProfitPercent(&v)
	}

	freeCapital := initial
	totalInvested := 0.0
	totalPortfolio := initial
	var current *singlePos
	totalMonthly := 0.0
	contribCount := 0

	sorted := unionDates(tickers)

	dayOfMonth := opt.MonthlyDayOfMonth
	if dayOfMonth == 0 {
		dayOfMonth = 1
	}
	if dayOfMonth < 1 {
		dayOfMonth = 1
	}
	if dayOfMonth > 28 {
		dayOfMonth = 28
	}
	contribStart := ""
	if opt.MonthlyAmount > 0 {
		if opt.MonthlyStartDate != "" {
			contribStart = opt.MonthlyStartDate
		} else if len(sorted) > 0 {
			contribStart = sorted[0]
		}
	}
	lastMonthKey := ""
	peakValue := totalPortfolio

	findTicker := func(sym string) *TickerIndexed {
		for i := range tickers {
			if tickers[i].Ticker == sym {
				return &tickers[i]
			}
		}
		return nil
	}

	updatePortfolio := func(pos *singlePos, date string) {
		positionValue := 0.0
		if pos != nil {
			td := findTicker(pos.ticker)
			if td != nil {
				if idx, ok := td.DateIndexMap[date]; ok {
					price := td.Data[idx].Close
					mv := pos.quantity * price
					exitC := commission(mv, strategy)
					stockPnL := (price - pos.entryPrice) * pos.quantity
					unreal := stockPnL - exitC
					positionValue = math.Max(0, pos.totalCost+unreal)
				} else {
					last := -1
					for i, bar := range td.Data {
						if bar.Date <= date {
							last = i
						} else {
							break
						}
					}
					if last != -1 {
						price := td.Data[last].Close
						mv := pos.quantity * price
						exitC := commission(mv, strategy)
						stockPnL := (price - pos.entryPrice) * pos.quantity
						unreal := stockPnL - exitC
						positionValue = math.Max(0, pos.totalCost+unreal)
					}
				}
			}
		}
		totalPortfolio = freeCapital + positionValue
	}

	for index, date := range sorted {
		var nextDate string
		if index < len(sorted)-1 {
			nextDate = sorted[index+1]
		}
		exitedThisBar := false

		if opt.MonthlyAmount > 0 && contribStart != "" && date >= contribStart {
			y, mo, d := tradingdate.YMD(date)
			monthKey := fmt.Sprintf("%d-%d", y, mo-1)
			if monthKey != lastMonthKey {
				var ny, nm int
				if nextDate != "" {
					ny, nm, _ = tradingdate.YMD(nextDate)
				}
				isLast := nextDate == "" || nm != mo || ny != y
				if d >= dayOfMonth || isLast {
					freeCapital += opt.MonthlyAmount
					totalMonthly += opt.MonthlyAmount
					contribCount++
					lastMonthKey = monthKey
				}
			}
		}

		updatePortfolio(current, date)

		if current != nil {
			td := findTicker(current.ticker)
			if td != nil {
				if barIndex, ok := td.DateIndexMap[date]; ok {
					bar := td.Data[barIndex]
					ibs := td.IBSValues[barIndex]
					daysSinceEntry := tradingdate.DaysBetween(current.entryDate, bar.Date)
					shouldExit := false
					exitReason := ""
					exitPrice := bar.Close
					tpPrice := metrics.TakeProfitPrice(current.entryPrice, tp)
					if metrics.ShouldTakeProfit(bar.High, tpPrice) {
						shouldExit = true
						exitReason = "take_profit"
						if tpPrice != nil {
							exitPrice = *tpPrice
						}
					} else if ibssig.IsExitSignal(ibs, highIBS) {
						shouldExit = true
						exitReason = "ibs_signal"
					} else if float64(daysSinceEntry) >= maxHoldDays {
						shouldExit = true
						exitReason = "max_hold_days"
					}
					if shouldExit {
						stockProceeds := current.quantity * exitPrice
						exitCommission := commission(stockProceeds, strategy)
						netProceeds := stockProceeds - exitCommission
						stockValueAtEntry := current.quantity * current.entryPrice
						totalCommissions := current.entryCommission + exitCommission
						stockPnL := (exitPrice - current.entryPrice) * current.quantity
						totalPnL := stockPnL - totalCommissions
						totalCashInvested := current.totalCost + current.entryCommission
						pnlPercent := 0.0
						if totalCashInvested > 0 {
							pnlPercent = (totalPnL / totalCashInvested) * 100
						}
						capitalBeforeExit := freeCapital
						freeCapital += totalCashInvested + totalPnL
						totalInvested = math.Max(0, totalInvested-totalCashInvested)
						updatePortfolio(nil, date)
						ticker := current.ticker
						trade := types.Trade{
							ID:        fmt.Sprintf("trade-%d", len(trades)),
							EntryDate: current.entryDate, ExitDate: bar.Date,
							EntryPrice: current.entryPrice, ExitPrice: exitPrice,
							Quantity: current.quantity, PnL: totalPnL, PnLPercent: pnlPercent,
							Duration: daysSinceEntry, ExitReason: exitReason,
							Context: &types.TradeContext{
								Ticker: ticker, MarketConditions: "normal",
								IndicatorValues: map[string]float64{"IBS": current.entryIBS, "exitIBS": ibs},
								Trend:           "sideways", InitialInvestment: totalCashInvested,
								GrossInvestment: current.quantity * current.entryPrice,
								Leverage:        leverage, LeverageDebt: stockValueAtEntry - current.totalCost,
								CommissionPaid: totalCommissions, NetProceeds: netProceeds,
								CapitalBeforeExit:       capitalBeforeExit,
								CurrentCapitalAfterExit: totalPortfolio,
								MarginUsed:              current.totalCost,
							},
						}
						if tp != nil {
							trade.Context.TakeProfit = *tp
						}
						trades = append(trades, trade)
						current = nil
						exitedThisBar = true
					}
				}
			}
		}

		canEnter := current == nil && (opt.AllowSameDayReentry || !exitedThisBar)
		if canEnter {
			bestIdx := -1
			bestIBS := 0.0
			var bestBar types.OHLC
			for ti, td := range tickers {
				barIndex, ok := td.DateIndexMap[date]
				if !ok {
					continue
				}
				bar := td.Data[barIndex]
				ibs := td.IBSValues[barIndex]
				if ibssig.IsEntrySignal(ibs, lowIBS) {
					if bestIdx < 0 || ibs < bestIBS {
						bestIdx = ti
						bestIBS = ibs
						bestBar = bar
					}
				}
			}
			if bestIdx >= 0 {
				td := tickers[bestIdx]
				targetInvestment := freeCapital * leverage
				entryPrice := bestBar.Close
				quantity := math.Floor(targetInvestment / entryPrice)
				if quantity > 0 {
					stockCost := quantity * entryPrice
					entryCommission := commission(stockCost, strategy)
					marginRequired := stockCost / leverage
					totalCashRequired := marginRequired + entryCommission
					if freeCapital >= totalCashRequired && totalCashRequired > 0 {
						current = &singlePos{
							ticker: td.Ticker, entryDate: bestBar.Date, entryPrice: entryPrice,
							quantity: quantity, entryIndex: bestIdx, totalCost: marginRequired,
							entryCommission: entryCommission, entryIBS: bestIBS,
						}
						freeCapital -= totalCashRequired
						totalInvested += totalCashRequired
					}
				}
			}
		}

		updatePortfolio(current, date)
		if totalPortfolio > peakValue {
			peakValue = totalPortfolio
		}
		dd := 0.0
		if peakValue > 0 {
			dd = ((peakValue - totalPortfolio) / peakValue) * 100
		}
		equity = append(equity, types.EquityPoint{Date: date, Value: totalPortfolio, Drawdown: dd})
		posVal := 0.0
		if current != nil {
			td := findTicker(current.ticker)
			if td != nil {
				if idx, ok := td.DateIndexMap[date]; ok {
					posVal = current.quantity * td.Data[idx].Close
				}
			}
		}
		exposure = append(exposure, types.ExposurePoint{
			Date: date, Equity: totalPortfolio, PositionValue: posVal,
			ExposurePct:     metrics.ExposurePct(posVal, totalPortfolio),
			ActivePositions: boolToInt(current != nil),
		})
	}

	if current != nil {
		td := findTicker(current.ticker)
		if td != nil && len(td.Data) > 0 {
			lastBar := td.Data[len(td.Data)-1]
			exitPrice := lastBar.Close
			stockProceeds := current.quantity * exitPrice
			exitCommission := commission(stockProceeds, strategy)
			stockValueAtEntry := current.quantity * current.entryPrice
			totalCommissions := current.entryCommission + exitCommission
			stockPnL := (exitPrice - current.entryPrice) * current.quantity
			totalPnL := stockPnL - totalCommissions
			totalCashInvested := current.totalCost + current.entryCommission
			pnlPercent := 0.0
			if totalCashInvested > 0 {
				pnlPercent = (totalPnL / totalCashInvested) * 100
			}
			duration := tradingdate.DaysBetween(current.entryDate, lastBar.Date)
			freeCapital += totalCashInvested + totalPnL
			totalInvested = math.Max(0, totalInvested-totalCashInvested)
			totalPortfolio = freeCapital + totalInvested
			exitIBS := 0.0
			if len(td.IBSValues) > 0 {
				exitIBS = td.IBSValues[len(td.Data)-1]
			}
			trades = append(trades, types.Trade{
				ID:        fmt.Sprintf("trade-%d", len(trades)),
				EntryDate: current.entryDate, ExitDate: lastBar.Date,
				EntryPrice: current.entryPrice, ExitPrice: exitPrice,
				Quantity: current.quantity, PnL: totalPnL, PnLPercent: pnlPercent,
				Duration: duration, ExitReason: "end_of_data",
				Context: &types.TradeContext{
					Ticker: current.ticker, MarketConditions: "normal",
					IndicatorValues: map[string]float64{"IBS": current.entryIBS, "exitIBS": exitIBS},
					Trend:           "sideways", InitialInvestment: totalCashInvested,
					GrossInvestment: current.quantity * current.entryPrice,
					Leverage:        leverage, LeverageDebt: stockValueAtEntry - current.totalCost,
					CommissionPaid: totalCommissions, NetProceeds: stockProceeds - exitCommission,
					CapitalBeforeExit:       freeCapital - totalCashInvested - totalPnL,
					CurrentCapitalAfterExit: totalPortfolio, MarginUsed: current.totalCost,
				},
			})
		}
	}

	m = metrics.BacktestMetrics(trades, equity, initial, totalMonthly, contribCount)
	finalValue = totalPortfolio
	maxDrawdown = m.MaxDrawdown
	return
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
