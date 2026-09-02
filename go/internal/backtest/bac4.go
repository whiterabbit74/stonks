package backtest

import (
	"fmt"
	"math"
	"sort"

	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type bac4Pos struct {
	ticker          string
	entryDate       string
	entryPrice      float64
	quantity        float64
	entryIndex      int
	totalCost       float64
	entryCommission float64
	entryIBS        float64
}

type BAC4Result struct {
	Equity      []types.EquityPoint      `json:"equity"`
	FinalValue  float64                  `json:"finalValue"`
	MaxDrawdown float64                  `json:"maxDrawdown"`
	Trades      []types.Trade            `json:"trades"`
	Metrics     map[string]float64       `json:"metrics"`
}

func RunBuyAtClose4(tickers []TickerIndexed, strategy types.Strategy, leverage float64) BAC4Result {
	if leverage == 0 {
		leverage = 1
	}
	if len(tickers) == 0 {
		return BAC4Result{Metrics: map[string]float64{}}
	}
	initial := strategy.RiskManagement.InitialCapital
	if initial == 0 {
		initial = 10000
	}
	capitalUsagePerTicker := 100.0 / float64(len(tickers))
	lowIBS := strategy.Parameters.LowIBS
	if lowIBS == 0 {
		lowIBS = 0.1
	}
	highIBS := strategy.Parameters.HighIBS
	if highIBS == 0 {
		highIBS = 0.75
	}
	maxHoldDays := strategy.Parameters.MaxHoldDays
	if maxHoldDays == 0 {
		maxHoldDays = 30
	}

	freeCapital := initial
	totalInvested := 0.0
	totalPortfolio := initial
	positions := make([]*bac4Pos, len(tickers))
	var trades []types.Trade
	var equity []types.EquityPoint

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

	barIndex := func(td TickerIndexed, date string) int {
		for i, bar := range td.Data {
			if bar.Date == date {
				return i
			}
		}
		return -1
	}

	getNet := func(pos *bac4Pos, price float64) float64 {
		mv := pos.quantity * price
		exitC := commission(mv, strategy)
		stockPnL := (price - pos.entryPrice) * pos.quantity
		unreal := stockPnL - exitC
		return pos.totalCost + unreal
	}

	updatePortfolio := func(date string) {
		totalPos := 0.0
		for i, pos := range positions {
			if pos == nil {
				continue
			}
			idx := barIndex(tickers[i], date)
			if idx != -1 {
				totalPos += getNet(pos, tickers[i].Data[idx].Close)
			}
		}
		totalPortfolio = freeCapital + totalPos
	}

	for _, currentDate := range sorted {
		updatePortfolio(currentDate)
		for tickerIndex := 0; tickerIndex < len(tickers); tickerIndex++ {
			td := tickers[tickerIndex]
			pos := positions[tickerIndex]
			idx := barIndex(td, currentDate)
			if idx == -1 {
				continue
			}
			bar := td.Data[idx]
			ibs := td.IBSValues[idx]
			if pos == nil {
				if ibs < lowIBS {
					baseTarget := totalPortfolio * (capitalUsagePerTicker / 100)
					target := baseTarget * leverage
					entryPrice := bar.Close
					quantity := math.Floor(target / entryPrice)
					if quantity > 0 {
						stockCost := quantity * entryPrice
						entryC := commission(stockCost, strategy)
						marginRequired := stockCost / leverage
						totalCash := marginRequired + entryC
						if freeCapital >= totalCash {
							positions[tickerIndex] = &bac4Pos{
								ticker: td.Ticker, entryDate: bar.Date, entryPrice: entryPrice,
								quantity: quantity, entryIndex: idx, totalCost: marginRequired,
								entryCommission: entryC, entryIBS: ibs,
							}
							freeCapital -= totalCash
							totalInvested += totalCash
						}
					}
				}
			} else {
				daysSince := tradingdate.DaysBetween(pos.entryDate, bar.Date)
				shouldExit := false
				exitReason := ""
				if ibs > highIBS {
					shouldExit = true
					exitReason = "ibs_signal"
				} else if float64(daysSince) >= maxHoldDays {
					shouldExit = true
					exitReason = "max_hold_days"
				}
				if shouldExit {
					exitPrice := bar.Close
					stockProceeds := pos.quantity * exitPrice
					exitC := commission(stockProceeds, strategy)
					netProceeds := stockProceeds - exitC
					stockValueAtEntry := pos.quantity * pos.entryPrice
					totalC := pos.entryCommission + exitC
					stockPnL := (exitPrice - pos.entryPrice) * pos.quantity
					totalPnL := stockPnL - totalC
					totalCashInvested := pos.totalCost + pos.entryCommission
					pnlPercent := 0.0
					if totalCashInvested > 0 {
						pnlPercent = (totalPnL / totalCashInvested) * 100
					}
					capitalBefore := freeCapital
					freeCapital += totalCashInvested + totalPnL
					totalInvested -= totalCashInvested
					positions[tickerIndex] = nil
					updatePortfolio(currentDate)
					trades = append(trades, types.Trade{
						ID: fmt.Sprintf("trade-%d", len(trades)),
						EntryDate: pos.entryDate, ExitDate: bar.Date,
						EntryPrice: pos.entryPrice, ExitPrice: exitPrice,
						Quantity: pos.quantity, PnL: totalPnL, PnLPercent: pnlPercent,
						Duration: daysSince, ExitReason: exitReason,
						Context: &types.TradeContext{
							Ticker: pos.ticker, MarketConditions: "normal",
							IndicatorValues: map[string]float64{"IBS": pos.entryIBS, "exitIBS": ibs},
							Trend: "sideways", InitialInvestment: totalCashInvested,
							GrossInvestment: pos.quantity * pos.entryPrice, Leverage: leverage,
							LeverageDebt: stockValueAtEntry - pos.totalCost, CommissionPaid: totalC,
							NetProceeds: netProceeds, CapitalBeforeExit: capitalBefore,
							CurrentCapitalAfterExit: totalPortfolio, MarginUsed: pos.totalCost,
						},
					})
				}
			}
		}

		updatePortfolio(currentDate)
		for i := range trades {
			if trades[i].ExitDate == currentDate && trades[i].Context != nil {
				trades[i].Context.CurrentCapitalAfterExit = totalPortfolio
			}
		}
		peak := totalPortfolio
		for _, e := range equity {
			if e.Value > peak {
				peak = e.Value
			}
		}
		dd := 0.0
		if peak > 0 {
			dd = ((peak - totalPortfolio) / peak) * 100
		}
		equity = append(equity, types.EquityPoint{Date: currentDate, Value: totalPortfolio, Drawdown: dd})
	}

	for i, pos := range positions {
		if pos == nil || len(tickers[i].Data) == 0 {
			continue
		}
		td := tickers[i]
		lastBar := td.Data[len(td.Data)-1]
		exitPrice := lastBar.Close
		stockProceeds := pos.quantity * exitPrice
		exitC := commission(stockProceeds, strategy)
		netProceeds := stockProceeds - exitC
		stockValueAtEntry := pos.quantity * pos.entryPrice
		totalC := pos.entryCommission + exitC
		stockPnL := (exitPrice - pos.entryPrice) * pos.quantity
		totalPnL := stockPnL - totalC
		totalCashInvested := pos.totalCost + pos.entryCommission
		pnlPercent := 0.0
		if totalCashInvested > 0 {
			pnlPercent = (totalPnL / totalCashInvested) * 100
		}
		duration := tradingdate.DaysBetween(pos.entryDate, lastBar.Date)
		capitalBefore := freeCapital
		freeCapital += totalCashInvested + totalPnL
		totalInvested -= totalCashInvested
		totalPortfolio = freeCapital + totalInvested
		exitIBS := 0.0
		if len(td.IBSValues) > 0 {
			exitIBS = td.IBSValues[len(td.Data)-1]
		}
		trades = append(trades, types.Trade{
			ID: fmt.Sprintf("trade-%d", len(trades)),
			EntryDate: pos.entryDate, ExitDate: lastBar.Date,
			EntryPrice: pos.entryPrice, ExitPrice: exitPrice,
			Quantity: pos.quantity, PnL: totalPnL, PnLPercent: pnlPercent,
			Duration: duration, ExitReason: "end_of_data",
			Context: &types.TradeContext{
				Ticker: pos.ticker, MarketConditions: "normal",
				IndicatorValues: map[string]float64{"IBS": pos.entryIBS, "exitIBS": exitIBS},
				Trend: "sideways", InitialInvestment: totalCashInvested,
				GrossInvestment: pos.quantity * pos.entryPrice, Leverage: leverage,
				LeverageDebt: stockValueAtEntry - pos.totalCost + pos.entryCommission,
				CommissionPaid: pos.entryCommission + exitC, NetProceeds: netProceeds,
				CapitalBeforeExit: capitalBefore, CurrentCapitalAfterExit: totalPortfolio,
				MarginUsed: pos.totalCost,
			},
		})
	}
	for i := range trades {
		if trades[i].ExitReason == "end_of_data" && trades[i].Context != nil {
			trades[i].Context.CurrentCapitalAfterExit = totalPortfolio
		}
	}

	finalValue := totalPortfolio
	maxDD := 0.0
	for _, e := range equity {
		if e.Drawdown > maxDD {
			maxDD = e.Drawdown
		}
	}
	totalReturn := ((finalValue - initial) / initial) * 100
	var winSum, lossSum float64
	wins, losses := 0, 0
	for _, t := range trades {
		if t.PnL > 0 {
			wins++
			winSum += t.PnL
		} else {
			losses++
			lossSum += t.PnL
		}
	}
	winRate := 0.0
	if len(trades) > 0 {
		winRate = float64(wins) / float64(len(trades)) * 100
	}
	avgWin := 0.0
	if wins > 0 {
		avgWin = winSum / float64(wins)
	}
	avgLoss := 0.0
	if losses > 0 {
		avgLoss = lossSum / float64(losses)
	}
	pf := 0.0
	den := math.Abs(avgLoss * float64(losses))
	num := avgWin * float64(wins)
	if den == 0 {
		if num != 0 {
			pf = math.Inf(1)
		}
	} else {
		pf = num / den
	}
	start, end := "", ""
	if len(sorted) > 0 {
		start, end = sorted[0], sorted[len(sorted)-1]
	}
	cagr := 0.0
	if start != "" {
		cagr = metrics.CAGR(finalValue, initial, start, end)
	}
	return BAC4Result{
		Equity: equity, FinalValue: finalValue, MaxDrawdown: maxDD, Trades: trades,
		Metrics: map[string]float64{
			"totalReturn": totalReturn, "cagr": cagr, "maxDrawdown": maxDD,
			"winRate": winRate, "profitFactor": pf, "totalTrades": float64(len(trades)),
			"winningTrades": float64(wins), "losingTrades": float64(losses),
			"avgWin": avgWin, "avgLoss": avgLoss, "finalValue": finalValue,
		},
	}
}
