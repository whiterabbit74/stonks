package backtest

import (
	"math"
	"sort"

	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type PositionRiskEvent struct {
	Type                 string  `json:"type"`
	Date                 string  `json:"date"`
	TradeID              string  `json:"tradeId"`
	TriggerPrice         float64 `json:"triggerPrice"`
	BarLow               float64 `json:"barLow"`
	RemainingCapital     float64 `json:"remainingCapital"`
	ThresholdPct         float64 `json:"thresholdPct"`
	PositionDropPct      float64 `json:"positionDropPct"`
	MarginRatioAtTrigger float64 `json:"marginRatioAtTrigger"`
}

type MarginResult struct {
	Equity                       []types.EquityPoint  `json:"equity"`
	Trades                       []types.Trade        `json:"trades"`
	MaxDrawdown                  float64              `json:"maxDrawdown"`
	FinalValue                   float64              `json:"finalValue"`
	MaintenanceLiquidationEvents []PositionRiskEvent  `json:"maintenanceLiquidationEvents"`
	LiquidationEvent             *PositionRiskEvent   `json:"liquidationEvent"`
}

type MarginParams struct {
	Market              []types.OHLC
	Trades              []types.Trade
	InitialCapital      float64
	Leverage            float64
	MaintenanceMarginPct float64
	CapitalUsagePct     float64
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func SimulateMargin(p MarginParams) MarginResult {
	if len(p.Market) == 0 || p.Leverage <= 0 {
		return MarginResult{FinalValue: math.Max(0, p.InitialCapital)}
	}
	bars := append([]types.OHLC(nil), p.Market...)
	sort.Slice(bars, func(i, j int) bool { return bars[i].Date < bars[j].Date })
	trades := append([]types.Trade(nil), p.Trades...)
	sort.Slice(trades, func(i, j int) bool {
		if trades[i].EntryDate != trades[j].EntryDate {
			return trades[i].EntryDate < trades[j].EntryDate
		}
		return trades[i].ExitDate < trades[j].ExitDate
	})
	usage := clamp(p.CapitalUsagePct, 0, 100) / 100
	if p.CapitalUsagePct == 0 {
		usage = 1
	}
	maint := p.MaintenanceMarginPct
	if maint == 0 {
		maint = 25
	}
	maint = clamp(maint, 1, 95)
	maintFrac := maint / 100

	cash := math.Max(0, p.InitialCapital)
	peak := cash
	tradeIndex := 0
	type active struct {
		template        types.Trade
		entryDate       string
		entryPrice      float64
		quantity        float64
		marginUsed      float64
		borrowed        float64
		plannedExitDate string
	}
	var pos *active
	var equity []types.EquityPoint
	var sim []types.Trade
	var events []PositionRiskEvent
	var liq *PositionRiskEvent

	for _, bar := range bars {
		date := bar.Date
		if pos == nil {
			for tradeIndex < len(trades) && trades[tradeIndex].EntryDate < date {
				tradeIndex++
			}
			if tradeIndex < len(trades) && trades[tradeIndex].EntryDate == date {
				tpl := trades[tradeIndex]
				tradeIndex++
				marginBudget := cash * usage
				desired := marginBudget * p.Leverage
				qty := math.Floor(desired / tpl.EntryPrice)
				if qty > 0 {
					notional := qty * tpl.EntryPrice
					marginUsed := notional / p.Leverage
					borrowed := notional - marginUsed
					cash -= marginUsed
					pos = &active{template: tpl, entryDate: tpl.EntryDate, entryPrice: tpl.EntryPrice,
						quantity: qty, marginUsed: marginUsed, borrowed: borrowed, plannedExitDate: tpl.ExitDate}
				}
			}
		}
		totalValue := cash
		if pos != nil {
			canLiq := date > pos.entryDate
			den := pos.quantity * (1 - maintFrac)
			maintPriceRaw := math.Inf(1)
			if den > 0 {
				maintPriceRaw = pos.borrowed / den
			}
			maintPrice := math.Min(pos.entryPrice, math.Max(0, maintPriceRaw))
			hit := canLiq && bar.Low <= maintPrice
			if hit {
				trigger := maintPrice
				proceeds := pos.quantity * math.Max(0, trigger)
				posEq := math.Max(0, proceeds-pos.borrowed)
				ratio := 0.0
				if proceeds > 0 {
					ratio = math.Max(0, math.Min(1, posEq/proceeds))
				}
				drop := 0.0
				if pos.entryPrice > 0 {
					drop = ((pos.entryPrice - math.Max(0, trigger)) / pos.entryPrice) * 100
				}
				cash += posEq
				pnl := posEq - pos.marginUsed
				pnlPct := 0.0
				if pos.marginUsed > 0 {
					pnlPct = (pnl / pos.marginUsed) * 100
				}
				t := pos.template
				t.Quantity = pos.quantity
				t.ExitDate = date
				t.ExitPrice = math.Max(0, trigger)
				t.PnL = pnl
				t.PnLPercent = pnlPct
				t.Duration = tradingdate.DaysBetween(pos.entryDate, date)
				t.ExitReason = "margin_liquidation"
				if t.Context == nil {
					t.Context = &types.TradeContext{}
				}
				t.Context.Leverage = p.Leverage
				t.Context.MarginUsed = pos.marginUsed
				t.Context.LeverageDebt = pos.borrowed
				t.Context.GrossInvestment = pos.quantity * pos.entryPrice
				t.Context.CurrentCapitalAfterExit = cash
				t.Context.MarginTriggerType = "maintenance_margin"
				t.Context.MaintenanceMarginPct = maint
				t.Context.MarginRatioAtTrigger = ratio
				sim = append(sim, t)
				totalValue = cash
				ev := PositionRiskEvent{
					Type: "maintenance_margin", Date: date, TradeID: pos.template.ID,
					TriggerPrice: trigger, BarLow: bar.Low, RemainingCapital: cash,
					ThresholdPct: maint, PositionDropPct: drop, MarginRatioAtTrigger: ratio,
				}
				liq = &ev
				events = append(events, ev)
				pos = nil
			} else if date == pos.plannedExitDate {
				planned := pos.template.ExitPrice
				proceeds := pos.quantity * planned
				posEq := math.Max(0, proceeds-pos.borrowed)
				cash += posEq
				pnl := posEq - pos.marginUsed
				pnlPct := 0.0
				if pos.marginUsed > 0 {
					pnlPct = (pnl / pos.marginUsed) * 100
				}
				t := pos.template
				t.Quantity = pos.quantity
				t.PnL = pnl
				t.PnLPercent = pnlPct
				t.Duration = tradingdate.DaysBetween(pos.entryDate, date)
				if t.Context == nil {
					t.Context = &types.TradeContext{}
				}
				t.Context.Leverage = p.Leverage
				t.Context.MarginUsed = pos.marginUsed
				t.Context.LeverageDebt = pos.borrowed
				t.Context.GrossInvestment = pos.quantity * pos.entryPrice
				t.Context.CurrentCapitalAfterExit = cash
				sim = append(sim, t)
				pos = nil
				totalValue = cash
			} else {
				notional := pos.quantity * bar.Close
				posEq := math.Max(0, notional-pos.borrowed)
				totalValue = cash + posEq
			}
		}
		if totalValue > peak {
			peak = totalValue
		}
		dd := 0.0
		if peak > 0 {
			dd = ((peak - totalValue) / peak) * 100
		}
		equity = append(equity, types.EquityPoint{Date: date, Value: totalValue, Drawdown: dd})
	}
	final := cash
	if len(equity) > 0 {
		final = equity[len(equity)-1].Value
	}
	maxDD := 0.0
	for _, p := range equity {
		if p.Drawdown > maxDD {
			maxDD = p.Drawdown
		}
	}
	return MarginResult{
		Equity: equity, Trades: sim, MaxDrawdown: maxDD, FinalValue: final,
		MaintenanceLiquidationEvents: events, LiquidationEvent: liq,
	}
}

func holdPrice(b types.OHLC) float64 {
	if b.AdjClose != nil && *b.AdjClose > 0 {
		return *b.AdjClose
	}
	return b.Close
}

func RunBuyHold(data []types.OHLC, initialCapital float64) types.BacktestResult {
	if initialCapital <= 0 {
		initialCapital = 10000
	}
	if len(data) == 0 {
		return types.BacktestResult{Trades: []types.Trade{}, Equity: []types.EquityPoint{}}
	}
	entry := data[0]
	exit := data[len(data)-1]
	firstPrice := holdPrice(entry)
	if firstPrice <= 0 {
		eq := make([]types.EquityPoint, len(data))
		for i, b := range data {
			eq[i] = types.EquityPoint{Date: b.Date, Value: initialCapital}
		}
		return types.BacktestResult{Trades: []types.Trade{}, Equity: eq, Metrics: metrics.New(nil, eq, initialCapital, nil).All()}
	}
	peak := initialCapital
	equity := make([]types.EquityPoint, len(data))
	for i, b := range data {
		v := initialCapital * (holdPrice(b) / firstPrice)
		if v > peak {
			peak = v
		}
		dd := 0.0
		if peak > 0 {
			dd = ((peak - v) / peak) * 100
		}
		equity[i] = types.EquityPoint{Date: b.Date, Value: v, Drawdown: dd}
	}
	lastPrice := holdPrice(exit)
	qty := initialCapital / firstPrice
	pnl := initialCapital*(lastPrice/firstPrice) - initialCapital
	trade := types.Trade{
		ID: "buyhold-0", EntryDate: entry.Date, ExitDate: exit.Date,
		EntryPrice: firstPrice, ExitPrice: lastPrice, Quantity: qty,
		PnL: pnl, PnLPercent: (lastPrice/firstPrice - 1) * 100,
		Duration: tradingdate.DaysBetween(entry.Date, exit.Date),
		ExitReason: "end_of_data",
	}
	m := metrics.New([]types.Trade{trade}, equity, initialCapital, nil).All()
	return types.BacktestResult{Trades: []types.Trade{trade}, Equity: equity, Metrics: m}
}
