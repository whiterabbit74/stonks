package backtest

import (
	"fmt"
	"math"
	"sort"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type EmaZone struct {
	ID       string  `json:"id"`
	LevelPct float64 `json:"levelPct"`
	Enabled  bool    `json:"enabled"`
}

type EmaParams struct {
	InitialCapital    float64   `json:"initialCapital"`
	Leverage          float64   `json:"leverage"`
	EmaPeriod         int       `json:"emaPeriod"`
	BuyZones          []EmaZone `json:"buyZones"`
	SellZones         []EmaZone `json:"sellZones"`
	TakeProfitPercent *float64  `json:"takeProfitPercent"`
	NoSellAtLoss      bool      `json:"noSellAtLoss"`
	SignalSource      string    `json:"signalSource"`
	EmaStartMode      string    `json:"emaStartMode"`
}

type EmaDeviationPoint struct {
	Date         string  `json:"date"`
	Ticker       string  `json:"ticker"`
	Price        float64 `json:"price"`
	EMA          float64 `json:"ema"`
	DeviationPct float64 `json:"deviationPct"`
}

type EmaResult struct {
	Equity      []types.EquityPoint     `json:"equity"`
	Exposure    []types.ExposurePoint   `json:"exposure"`
	FinalValue  float64                 `json:"finalValue"`
	MaxDrawdown float64                 `json:"maxDrawdown"`
	Trades      []types.Trade           `json:"trades"`
	Metrics     types.BacktestMetrics   `json:"metrics"`
	Deviation   []EmaDeviationPoint     `json:"deviation"`
}

type emaLot struct {
	id                string
	ticker            string
	zoneID            string
	entryDate         string
	entryPrice        float64
	entryRawPrice     *float64
	entryEma          float64
	entryDeviationPct float64
	quantity          float64
	initialQuantity   float64
	marginUsed        float64
	closedSellZoneIDs []string
	priceBasis        string
}

type preparedTicker struct {
	ticker   string
	data     []types.OHLC
	ema      []float64
	byDate   map[string]int
	rawByDate map[string]types.OHLC
}

func enabledZones(zones []EmaZone) []EmaZone {
	var out []EmaZone
	for _, z := range zones {
		if z.Enabled && !math.IsNaN(z.LevelPct) && !math.IsInf(z.LevelPct, 0) {
			out = append(out, z)
		}
	}
	return out
}

func calculateDeviation(price, ema float64) float64 {
	if !isFin(price) || !isFin(ema) || ema == 0 {
		return 0
	}
	return ((price / ema) - 1) * 100
}

func capitalTolerance(value float64) float64 {
	return math.Max(1e-8, math.Abs(value)*1e-10)
}

func priceBasisLabel(b string) string {
	switch b {
	case "holder_value":
		return "Индексная цена с учетом сплитов"
	case "split_adjusted_index":
		return "Split-adjusted индексная цена"
	default:
		return "Реальная цена close"
	}
}

func rawCloseForBar(bar types.OHLC) *float64 {
	if bar.RawClose != nil && isFin(*bar.RawClose) {
		return bar.RawClose
	}
	return nil
}

func rawPriceForExecution(bar types.OHLC, executionPrice float64) *float64 {
	if !isFin(executionPrice) {
		return nil
	}
	if bar.RawClose != nil && isFin(*bar.RawClose) && executionPrice == bar.Close {
		return bar.RawClose
	}
	if bar.PriceBasis == "holder_value" && bar.SplitFactor != nil && *bar.SplitFactor > 0 {
		v := executionPrice / *bar.SplitFactor
		return &v
	}
	return rawCloseForBar(bar)
}

func isFin(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func computeEma(closes []float64, period int, startMode string) []float64 {
	if len(closes) == 0 {
		return nil
	}
	if startMode == "from_start" {
		return indicators.EMAFromStart(closes, period)
	}
	if len(closes) >= period {
		v, err := indicators.EMA(closes, period)
		if err != nil {
			return nil
		}
		return v
	}
	return nil
}

func prepareEmaTickers(tickers []TickerIndexed, period int, startMode string) []preparedTicker {
	var out []preparedTicker
	for _, td := range tickers {
		rawByDate := map[string]types.OHLC{}
		data := append([]types.OHLC(nil), td.Data...)
		sort.Slice(data, func(i, j int) bool { return data[i].Date < data[j].Date })
		for i, bar := range data {
			if raw, ok := rawByDate[bar.Date]; ok {
				if bar.RawOpen == nil {
					data[i].RawOpen = &raw.Open
				}
				if bar.RawHigh == nil {
					data[i].RawHigh = &raw.High
				}
				if bar.RawLow == nil {
					data[i].RawLow = &raw.Low
				}
				if bar.RawClose == nil {
					data[i].RawClose = &raw.Close
				}
			}
			if data[i].PriceBasis == "" {
				data[i].PriceBasis = "raw"
			}
		}
		closes := make([]float64, len(data))
		for i, bar := range data {
			closes[i] = bar.Close
		}
		ema := computeEma(closes, period, startMode)
		byDate := map[string]int{}
		for i, bar := range data {
			byDate[bar.Date] = i
		}
		if len(data) == 0 {
			continue
		}
		out = append(out, preparedTicker{
			ticker: stringsUpper(td.Ticker), data: data, ema: ema, byDate: byDate, rawByDate: rawByDate,
		})
	}
	return out
}

func stringsUpper(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}

type emaSignal struct {
	reached            bool
	executionPrice     float64
	deviationPct       float64
	rawExecutionPrice  *float64
}

func getSignalPrice(bar types.OHLC, ema, levelPct float64, side, source string) emaSignal {
	if source == "intraday" {
		probe := bar.High
		if side == "buy" {
			probe = bar.Low
		}
		probeDev := calculateDeviation(probe, ema)
		reached := probeDev >= levelPct
		if side == "buy" {
			reached = probeDev <= levelPct
		}
		return emaSignal{
			reached: reached, executionPrice: bar.Close,
			deviationPct: calculateDeviation(bar.Close, ema),
			rawExecutionPrice: rawPriceForExecution(bar, bar.Close),
		}
	}
	dev := calculateDeviation(bar.Close, ema)
	reached := dev >= levelPct
	if side == "buy" {
		reached = dev <= levelPct
	}
	return emaSignal{
		reached: reached, executionPrice: bar.Close, deviationPct: dev,
		rawExecutionPrice: rawPriceForExecution(bar, bar.Close),
	}
}

func containsStr(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

func closeLot(lot emaLot, quantity float64, exitDate string, exitPrice float64, exitRaw *float64, exitReason string, exitDev float64, zoneID string, tradeIndex int) types.Trade {
	pnl := (exitPrice - lot.entryPrice) * quantity
	entryShare := quantity / lot.quantity
	marginUsed := lot.marginUsed * entryShare
	pnlPercent := 0.0
	if marginUsed > 0 {
		pnlPercent = (pnl / marginUsed) * 100
	}
	duration := tradingdate.DaysBetween(lot.entryDate, exitDate)
	qtyBasis := "index_units"
	if lot.priceBasis == "raw" {
		qtyBasis = "shares"
	}
	ctx := &types.TradeContext{
		Ticker: lot.ticker, MarketConditions: "ema-zone",
		IndicatorValues: map[string]float64{
			"entryEma": lot.entryEma, "entryDeviationPct": lot.entryDeviationPct, "exitDeviationPct": exitDev,
		},
		InitialInvestment: marginUsed, GrossInvestment: lot.entryPrice * quantity, MarginUsed: marginUsed,
		PriceBasis: lot.priceBasis, PriceBasisLabel: priceBasisLabel(lot.priceBasis), QuantityBasis: qtyBasis,
		EntryRawClose: lot.entryRawPrice, ExitRawClose: exitRaw,
		EntryIndexPrice: lot.entryPrice, ExitIndexPrice: exitPrice,
		Trend: lot.zoneID, Volatility: 0,
	}
	if zoneID != "" {
		ctx.Trend = zoneID
	}
	if exitReason == "take_profit" {
		ctx.TakeProfit = exitPrice
	}
	return types.Trade{
		ID: fmt.Sprintf("ema-trade-%d", tradeIndex),
		EntryDate: lot.entryDate, ExitDate: exitDate,
		EntryPrice: lot.entryPrice, ExitPrice: exitPrice, Quantity: quantity,
		PnL: pnl, PnLPercent: pnlPercent, Duration: duration, ExitReason: exitReason, Context: ctx,
	}
}

func CalculateEmaDeviation(tickers []TickerIndexed, period int, startMode string) []EmaDeviationPoint {
	if startMode == "" {
		startMode = "full_history"
	}
	prepared := prepareEmaTickers(tickers, period, startMode)
	var out []EmaDeviationPoint
	for _, td := range prepared {
		for i, bar := range td.data {
			if i >= len(td.ema) || !isFin(td.ema[i]) {
				continue
			}
			out = append(out, EmaDeviationPoint{
				Date: bar.Date, Ticker: td.ticker, Price: bar.Close, EMA: td.ema[i],
				DeviationPct: calculateDeviation(bar.Close, td.ema[i]),
			})
		}
	}
	return out
}

func RunEmaZone(tickers []TickerIndexed, params EmaParams) EmaResult {
	initial := params.InitialCapital
	if !isFin(initial) || initial <= 0 {
		initial = 10000
	}
	leverage := params.Leverage
	if !isFin(leverage) || leverage <= 0 {
		leverage = 1
	}
	buyZones := enabledZones(params.BuyZones)
	sort.Slice(buyZones, func(i, j int) bool { return buyZones[i].LevelPct > buyZones[j].LevelPct })
	sellZones := enabledZones(params.SellZones)
	sort.Slice(sellZones, func(i, j int) bool { return sellZones[i].LevelPct < sellZones[j].LevelPct })
	emaPeriod := params.EmaPeriod
	if emaPeriod < 1 {
		emaPeriod = 1
	}
	startMode := "full_history"
	if params.EmaStartMode == "from_start" {
		startMode = "from_start"
	}
	prepared := prepareEmaTickers(tickers, emaPeriod, startMode)
	dateSet := map[string]struct{}{}
	for _, td := range prepared {
		for _, bar := range td.data {
			dateSet[bar.Date] = struct{}{}
		}
	}
	allDates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		allDates = append(allDates, d)
	}
	sort.Strings(allDates)

	var trades []types.Trade
	var equity []types.EquityPoint
	var exposure []types.ExposurePoint
	var lots []emaLot
	cash := initial
	peak := initial
	deviation := CalculateEmaDeviation(tickers, emaPeriod, startMode)

	findPrepared := func(sym string) *preparedTicker {
		for i := range prepared {
			if prepared[i].ticker == sym {
				return &prepared[i]
			}
		}
		return nil
	}

	currentPositionValue := func(date string) float64 {
		sum := 0.0
		for _, lot := range lots {
			td := findPrepared(lot.ticker)
			close := lot.entryPrice
			if td != nil {
				if idx, ok := td.byDate[date]; ok {
					close = td.data[idx].Close
				}
			}
			sum += lot.quantity * close
		}
		return sum
	}
	currentLeverageDebt := func() float64 {
		sum := 0.0
		for _, lot := range lots {
			gross := lot.entryPrice * lot.quantity
			sum += math.Max(0, gross-lot.marginUsed)
		}
		return sum
	}
	currentEquityValue := func(date string) float64 {
		return cash + currentPositionValue(date) - currentLeverageDebt()
	}

	src := params.SignalSource
	if src == "" {
		src = "close"
	}

	for _, date := range allDates {
		for ti := range prepared {
			td := &prepared[ti]
			idx, ok := td.byDate[date]
			if !ok {
				continue
			}
			bar := td.data[idx]
			if idx >= len(td.ema) || !isFin(td.ema[idx]) {
				continue
			}
			ema := td.ema[idx]

			for _, lot := range append([]emaLot(nil), lots...) {
				if lot.ticker != td.ticker {
					continue
				}
				tpPrice := metrics.TakeProfitPrice(lot.entryPrice, params.TakeProfitPercent)
				if !metrics.ShouldTakeProfit(bar.High, tpPrice) {
					continue
				}
				exitP := bar.Close
				if tpPrice != nil {
					exitP = *tpPrice
				}
				capitalBefore := currentEquityValue(date)
				lotIdx := -1
				for i := range lots {
					if lots[i].id == lot.id {
						lotIdx = i
						break
					}
				}
				if lotIdx < 0 {
					continue
				}
				live := lots[lotIdx]
				trade := closeLot(live, live.quantity, bar.Date, exitP, rawPriceForExecution(bar, exitP), "take_profit", calculateDeviation(exitP, ema), "", len(trades))
				trades = append(trades, trade)
				cash += live.marginUsed + trade.PnL
				lots = append(lots[:lotIdx], lots[lotIdx+1:]...)
				trade.Context.CapitalBeforeExit = capitalBefore
				trade.Context.CurrentCapitalAfterExit = currentEquityValue(date)
				trades[len(trades)-1] = trade
			}

			for zi, sellZone := range sellZones {
				signal := getSignalPrice(bar, ema, sellZone.LevelPct, "sell", src)
				if !signal.reached {
					continue
				}
				isLast := zi == len(sellZones)-1
				var tickerLots []int
				for i, lot := range lots {
					if lot.ticker == td.ticker && !containsStr(lot.closedSellZoneIDs, sellZone.ID) {
						tickerLots = append(tickerLots, i)
					}
				}
				for _, li := range append([]int(nil), tickerLots...) {
					if li >= len(lots) {
						continue
					}
					lot := lots[li]
					if lot.ticker != td.ticker || containsStr(lot.closedSellZoneIDs, sellZone.ID) {
						continue
					}
					baseQty := lot.quantity
					if len(sellZones) > 1 {
						baseQty = lot.initialQuantity / float64(len(sellZones))
					}
					qtyClose := baseQty
					if isLast {
						qtyClose = lot.quantity
					} else if qtyClose > lot.quantity {
						qtyClose = lot.quantity
					}
					if qtyClose <= 0 {
						continue
					}
					if params.NoSellAtLoss && signal.executionPrice < lot.entryPrice {
						continue
					}
					capitalBefore := currentEquityValue(date)
					trade := closeLot(lot, qtyClose, bar.Date, signal.executionPrice, signal.rawExecutionPrice, fmt.Sprintf("ema_sell_%v", sellZone.LevelPct), signal.deviationPct, sellZone.ID, len(trades))
					trades = append(trades, trade)
					marginShare := lot.marginUsed * (qtyClose / lot.quantity)
					cash += marginShare + trade.PnL
					lots[li].quantity -= qtyClose
					lots[li].marginUsed -= marginShare
					lots[li].closedSellZoneIDs = append(lots[li].closedSellZoneIDs, sellZone.ID)
					if lots[li].quantity <= 0 {
						lots = append(lots[:li], lots[li+1:]...)
					}
					trade.Context.CapitalBeforeExit = capitalBefore
					trade.Context.CurrentCapitalAfterExit = currentEquityValue(date)
					trades[len(trades)-1] = trade
				}
			}

			equityBeforeBuys := currentEquityValue(date)
			for _, buyZone := range buyZones {
				occupied := false
				for _, lot := range lots {
					if lot.ticker == td.ticker && lot.zoneID == buyZone.ID {
						occupied = true
						break
					}
				}
				if occupied {
					continue
				}
				signal := getSignalPrice(bar, ema, buyZone.LevelPct, "buy", src)
				if !signal.reached {
					continue
				}
				grossTarget := equityBeforeBuys * leverage / float64(len(buyZones))
				targetMargin := grossTarget / leverage
				if targetMargin > cash+capitalTolerance(cash) {
					continue
				}
				marginUsed := math.Min(targetMargin, cash)
				quantity := (marginUsed * leverage) / signal.executionPrice
				if quantity <= 0 || marginUsed <= 0 {
					continue
				}
				cash -= marginUsed
				basis := bar.PriceBasis
				if basis == "" {
					basis = "raw"
				}
				lots = append(lots, emaLot{
					id: fmt.Sprintf("ema-lot-%s-%s-%s", date, td.ticker, buyZone.ID),
					ticker: td.ticker, zoneID: buyZone.ID, entryDate: bar.Date,
					entryPrice: signal.executionPrice, entryRawPrice: signal.rawExecutionPrice,
					entryEma: ema, entryDeviationPct: signal.deviationPct,
					quantity: quantity, initialQuantity: quantity, marginUsed: marginUsed,
					priceBasis: basis,
				})
			}
		}

		posVal := currentPositionValue(date)
		eqVal := currentEquityValue(date)
		if eqVal > peak {
			peak = eqVal
		}
		dd := 0.0
		if peak > 0 {
			dd = ((peak - eqVal) / peak) * 100
		}
		equity = append(equity, types.EquityPoint{Date: date, Value: eqVal, Drawdown: dd})
		exposure = append(exposure, types.ExposurePoint{
			Date: date, Equity: eqVal, PositionValue: posVal,
			ExposurePct: metrics.ExposurePct(posVal, eqVal), ActivePositions: len(lots),
		})
	}

	if len(allDates) > 0 {
		lastDate := allDates[len(allDates)-1]
		for _, lot := range append([]emaLot(nil), lots...) {
			td := findPrepared(lot.ticker)
			if td == nil {
				continue
			}
			lastBar := td.data[len(td.data)-1]
			if idx, ok := td.byDate[lastDate]; ok {
				lastBar = td.data[idx]
			}
			capitalBefore := currentEquityValue(lastBar.Date)
			emaLast := lastBar.Close
			if len(td.ema) > 0 {
				emaLast = td.ema[len(td.data)-1]
			}
			trade := closeLot(lot, lot.quantity, lastBar.Date, lastBar.Close, rawPriceForExecution(lastBar, lastBar.Close), "end_of_data", calculateDeviation(lastBar.Close, emaLast), "", len(trades))
			trades = append(trades, trade)
			cash += lot.marginUsed + trade.PnL
			for i := range lots {
				if lots[i].id == lot.id {
					lots = append(lots[:i], lots[i+1:]...)
					break
				}
			}
			trade.Context.CapitalBeforeExit = capitalBefore
			trade.Context.CurrentCapitalAfterExit = currentEquityValue(lastBar.Date)
			trades[len(trades)-1] = trade
		}
	}

	m := metrics.BacktestMetrics(trades, equity, initial, 0, 0)
	return EmaResult{
		Equity: equity, Exposure: exposure, FinalValue: cash, MaxDrawdown: m.MaxDrawdown,
		Trades: trades, Metrics: m, Deviation: deviation,
	}
}
