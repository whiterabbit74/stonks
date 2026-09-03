package backtest

import (
	"fmt"
	"math"

	ibssig "mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type CleanOptions struct {
	EntryExecution           string // "close" | "nextOpen"
	IgnoreMaxHoldDaysExit    bool
	IBSExitRequireAboveEntry bool
	Splits                   []types.SplitEvent
}

type cleanPosition struct {
	entryDate  string
	entryPrice float64
	quantity   float64
	entryIndex int
	entryIBS   float64
}

func cleanMaxHoldDays(strategy types.Strategy) float64 {
	if strategy.Parameters.MaxHoldDays != nil {
		return *strategy.Parameters.MaxHoldDays
	}
	return types.F64Or(strategy.RiskManagement.MaxHoldDays, 30)
}

func RunClean(data []types.OHLC, strategy types.Strategy, options *CleanOptions) types.BacktestResult {
	opt := CleanOptions{EntryExecution: "close"}
	if options != nil {
		opt = *options
		if opt.EntryExecution == "" {
			opt.EntryExecution = "close"
		}
	}
	if len(opt.Splits) > 0 {
		data = splits.AdjustOHLC(data, opt.Splits)
	}
	lowIBS, highIBS, _, initial := ibsParams(strategy)
	maxHoldDays := cleanMaxHoldDays(strategy)
	if len(data) == 0 {
		m := metrics.New(nil, nil, initial, nil).All()
		return types.BacktestResult{Trades: []types.Trade{}, Metrics: m, Equity: []types.EquityPoint{}, ChartData: []types.ChartCandle{}, Insights: []interface{}{}}
	}

	ibsValues := indicators.IBS(data)
	currentCapital := initial
	var trades []types.Trade
	var equity []types.EquityPoint
	var position *cleanPosition
	peakValue := 0.0

	capitalUsage := types.F64Or(strategy.RiskManagement.CapitalUsage, 100)

	for i := 0; i < len(data); i++ {
		bar := data[i]
		var nextBar *types.OHLC
		if i+1 < len(data) {
			nextBar = &data[i+1]
		}
		ibs := ibsValues[i]

		if position == nil {
			if ibssig.IsEntrySignal(ibs, lowIBS) && nextBar != nil {
				investmentAmount := (currentCapital * capitalUsage) / 100
				if opt.EntryExecution == "nextOpen" {
					quantity := math.Floor(investmentAmount / nextBar.Open)
					if quantity > 0 {
						totalCost := quantity * nextBar.Open
						position = &cleanPosition{
							entryDate: nextBar.Date, entryPrice: nextBar.Open,
							quantity: quantity, entryIndex: i + 1, entryIBS: ibs,
						}
						currentCapital -= totalCost
					}
				} else {
					quantity := math.Floor(investmentAmount / bar.Close)
					if quantity > 0 {
						totalCost := quantity * bar.Close
						position = &cleanPosition{
							entryDate: bar.Date, entryPrice: bar.Close,
							quantity: quantity, entryIndex: i, entryIBS: ibs,
						}
						currentCapital -= totalCost
					}
				}
			}
		} else {
			isEntryDay := i == position.entryIndex
			canCheckToday := !isEntryDay || opt.EntryExecution == "nextOpen"
			if canCheckToday {
				shouldExit := false
				exitReason := ""
				if ibssig.IsExitSignal(ibs, highIBS) {
					if !opt.IBSExitRequireAboveEntry || bar.Close > position.entryPrice {
						shouldExit = true
						exitReason = "ibs_signal"
					}
				}
				if !shouldExit && !opt.IgnoreMaxHoldDaysExit {
					daysDiff := tradingdate.DaysBetween(position.entryDate, bar.Date)
					if float64(daysDiff) >= maxHoldDays {
						shouldExit = true
						exitReason = "max_hold_days"
					}
				}
				if shouldExit {
					exitPrice := bar.Close
					grossProceeds := position.quantity * exitPrice
					grossCost := position.quantity * position.entryPrice
					pnl := grossProceeds - grossCost
					pnlPercent := (pnl / grossCost) * 100
					duration := tradingdate.DaysBetween(position.entryDate, bar.Date)
					trade := types.Trade{
						ID:        fmt.Sprintf("trade-%d", len(trades)),
						EntryDate: position.entryDate, ExitDate: bar.Date,
						EntryPrice: position.entryPrice, ExitPrice: exitPrice,
						Quantity: position.quantity, PnL: pnl, PnLPercent: pnlPercent,
						Duration: duration, ExitReason: exitReason,
						Context: &types.TradeContext{
							MarketConditions:  "normal",
							IndicatorValues:   map[string]float64{"IBS": position.entryIBS, "exitIBS": ibs},
							Trend:             "sideways",
							InitialInvestment: grossCost,
						},
					}
					trades = append(trades, trade)
					currentCapital += grossProceeds
					trade.Context.CurrentCapitalAfterExit = currentCapital
					trades[len(trades)-1] = trade
					position = nil
				}
			}
		}

		totalValue := currentCapital
		if position != nil {
			totalValue += position.quantity * bar.Close
		}
		if totalValue > peakValue {
			peakValue = totalValue
		}
		drawdown := 0.0
		if peakValue > 0 {
			drawdown = ((peakValue - totalValue) / peakValue) * 100
		}
		equity = append(equity, types.EquityPoint{Date: bar.Date, Value: totalValue, Drawdown: drawdown})
	}

	lastBar := data[len(data)-1]
	lastIBS := ibsValues[len(data)-1]
	if position != nil {
		shouldExit := false
		exitReason := ""
		if !math.IsNaN(lastIBS) && lastIBS > highIBS && (!opt.IBSExitRequireAboveEntry || lastBar.Close > position.entryPrice) {
			shouldExit = true
			exitReason = "ibs_signal"
		} else {
			daysDiff := tradingdate.DaysBetween(position.entryDate, lastBar.Date)
			if !opt.IgnoreMaxHoldDaysExit && float64(daysDiff) >= maxHoldDays {
				shouldExit = true
				exitReason = "max_hold_days"
			} else {
				shouldExit = true
				exitReason = "end_of_data"
			}
		}
		if shouldExit {
			exitPrice := lastBar.Close
			grossProceeds := position.quantity * exitPrice
			grossCost := position.quantity * position.entryPrice
			pnl := grossProceeds - grossCost
			pnlPercent := (pnl / grossCost) * 100
			duration := tradingdate.DaysBetween(position.entryDate, lastBar.Date)
			trade := types.Trade{
				ID:        fmt.Sprintf("trade-%d", len(trades)),
				EntryDate: position.entryDate, ExitDate: lastBar.Date,
				EntryPrice: position.entryPrice, ExitPrice: exitPrice,
				Quantity: position.quantity, PnL: pnl, PnLPercent: pnlPercent,
				Duration: duration, ExitReason: exitReason,
				Context: &types.TradeContext{
					MarketConditions:  "normal",
					IndicatorValues:   map[string]float64{"IBS": position.entryIBS, "exitIBS": lastIBS},
					Trend:             "sideways",
					InitialInvestment: grossCost,
				},
			}
			trades = append(trades, trade)
			currentCapital += grossProceeds
			trade.Context.CurrentCapitalAfterExit = currentCapital
			trades[len(trades)-1] = trade
			position = nil
		}
	}

	finalValue := currentCapital
	if position != nil {
		finalValue += position.quantity * lastBar.Close
	}
	if finalValue > peakValue {
		peakValue = finalValue
	}
	finalDrawdown := 0.0
	if peakValue > 0 {
		finalDrawdown = ((peakValue - finalValue) / peakValue) * 100
	}
	lastIdx := len(equity) - 1
	if lastIdx >= 0 && equity[lastIdx].Date == lastBar.Date {
		equity[lastIdx] = types.EquityPoint{Date: lastBar.Date, Value: finalValue, Drawdown: finalDrawdown}
	} else {
		equity = append(equity, types.EquityPoint{Date: lastBar.Date, Value: finalValue, Drawdown: finalDrawdown})
	}

	m := metrics.New(trades, equity, initial, nil).All()
	chart := make([]types.ChartCandle, len(data))
	for i, bar := range data {
		chart[i] = types.ChartCandle{
			Time: tradingdate.ChartTimestamp(bar.Date),
			Open: bar.Open, High: bar.High, Low: bar.Low, Close: bar.Close,
		}
	}
	if trades == nil {
		trades = []types.Trade{}
	}
	return types.BacktestResult{Trades: trades, Metrics: m, Equity: equity, ChartData: chart, Insights: []interface{}{}}
}

func RunBacktest(data []types.OHLC, strategy types.Strategy) types.BacktestResult {
	return RunClean(data, strategy, nil)
}

func RunBuyAtClose(data []types.OHLC, strategy types.Strategy) types.BacktestResult {
	return RunClean(data, strategy, &CleanOptions{EntryExecution: "nextOpen"})
}

type NoStopLossConfig struct {
	ExitMode              string  `json:"exitMode"` // never | ibs-only | time-limit | profit-target
	MaxHoldDays           float64 `json:"maxHoldDays"`
	ProfitTarget          float64 `json:"profitTarget"`
	RequireProfitableExit bool    `json:"requireProfitableExit"`
	Leverage              float64 `json:"leverage"`
}

func RunNoStopLoss(data []types.OHLC, strategy types.Strategy, cfg NoStopLossConfig) types.BacktestResult {
	modified := strategy
	modified.RiskManagement.UseStopLoss = false
	modified.RiskManagement.UseTakeProfit = cfg.ExitMode == "profit-target"
	modified.RiskManagement.TakeProfit = cfg.ProfitTarget
	if cfg.Leverage > 0 {
		modified.RiskManagement.Leverage = cfg.Leverage
	}
	if cfg.ExitMode == "time-limit" {
		v := cfg.MaxHoldDays
		modified.Parameters.MaxHoldDays = &v
	} else {
		v := 9999.0
		modified.Parameters.MaxHoldDays = &v
	}
	ignoreMax := cfg.ExitMode == "never" || cfg.ExitMode == "ibs-only"
	return RunClean(data, modified, &CleanOptions{
		EntryExecution:           "nextOpen",
		IgnoreMaxHoldDaysExit:    ignoreMax,
		IBSExitRequireAboveEntry: cfg.RequireProfitableExit,
	})
}
