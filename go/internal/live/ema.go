package live

import (
	"fmt"
	"math"
	"strings"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

type EmaEval struct {
	ID, Symbol, Action, NextAction string
	EmaPeriod                      int
	BuyLevelPct, SellLevelPct      float64
	ActiveLevelPct, ThresholdPct   float64
	InfoLevelPct                   float64
	DeviationPct, EMA, Price       float64
	DataOK, Near, Reached          bool
	InfoCrossing, InfoSide         string
	Warning                        IntegrityResult
}

func (e *Engine) EvaluateEMAAlerts() []EmaEval {
	alerts, _ := e.DB.ListEMAAlerts()
	var out []EmaEval
	// Node uses the real-time chain here too (emaAlerts.js ->
	// fetchTodayRangeAndQuote), not resultsQuoteProvider, whose default
	// alpha_vantage would answer with a daily bar.
	providerChain := quoteProviderChain(e.AutoConfig())
	today := tradingdate.TodayNYSE(e.now())
	for _, a := range alerts {
		if enabled, ok := a["enabled"].(bool); ok && !enabled {
			continue
		}
		out = append(out, e.evalEMAAlert(a, providerChain, today))
	}
	return out
}

func (e *Engine) evalEMAAlert(a map[string]any, providerChain []string, today string) EmaEval {
	ev := EmaEval{
		ID:           fmt.Sprint(a["id"]),
		Symbol:       store.SafeTicker(fmt.Sprint(a["symbol"])),
		EmaPeriod:    int(asFloat(a["emaPeriod"])),
		BuyLevelPct:  asFloat(a["buyLevelPct"]),
		SellLevelPct: asFloat(a["sellLevelPct"]),
		ThresholdPct: asFloat(a["thresholdPct"]),
		InfoLevelPct: asFloat(a["infoLevelPct"]),
		NextAction:   strings.ToLower(fmt.Sprint(a["nextAction"])),
	}
	if ev.EmaPeriod != 20 {
		ev.EmaPeriod = 200
	}
	if ev.ThresholdPct <= 0 {
		ev.ThresholdPct = 0.5
	}
	if ev.BuyLevelPct == 0 && a["buyLevelPct"] == nil {
		ev.BuyLevelPct = 15
	}
	if ev.SellLevelPct == 0 && a["sellLevelPct"] == nil {
		ev.SellLevelPct = 40
	}
	if ev.InfoLevelPct == 0 && a["infoLevelPct"] == nil {
		ev.InfoLevelPct = -20
	}
	if ev.NextAction != "sell" {
		ev.NextAction = "buy"
	}
	ev.Action = ev.NextAction
	ev.ActiveLevelPct = ev.BuyLevelPct
	if ev.Action == "sell" {
		ev.ActiveLevelPct = ev.SellLevelPct
	}

	bars, adj, err := e.DB.GetOHLC(ev.Symbol)
	if err != nil || len(bars) < ev.EmaPeriod {
		return ev
	}
	price := 0.0
	if q, _, qerr := e.liveQuote(ev.Symbol, providerChain); qerr == nil {
		price = asFloat(q.Quote["current"])
	}
	if price <= 0 {
		price = bars[len(bars)-1].Close
	}
	ev.Price = price
	splits, _ := e.DB.ListSplits(ev.Symbol)
	if today == "" && len(bars) > 0 {
		today = string(bars[len(bars)-1].Date)
	}
	integ := EvaluatePriceIntegrity(ev.Symbol, bars, price, today, splits, adj)
	if integ.BlockSignals {
		ev.Warning = integ
		return ev
	}
	closes := make([]float64, 0, len(bars)+1)
	for _, b := range bars {
		closes = append(closes, b.Close)
	}
	closes = append(closes, price)
	series, err := indicators.EMA(closes, ev.EmaPeriod)
	if err != nil || len(series) == 0 {
		return ev
	}
	ema := series[len(series)-1]
	if math.IsNaN(ema) || ema == 0 {
		return ev
	}
	ev.EMA = ema
	ev.DeviationPct = (price/ema - 1) * 100
	ev.DataOK = true
	ev.Near = math.Abs(ev.DeviationPct-ev.ActiveLevelPct) <= ev.ThresholdPct
	if ev.Action == "buy" {
		ev.Reached = ev.DeviationPct <= ev.ActiveLevelPct
	} else {
		ev.Reached = ev.DeviationPct >= ev.ActiveLevelPct
	}
	infoSide := "below"
	if ev.DeviationPct >= ev.InfoLevelPct {
		infoSide = "above"
	}
	ev.InfoSide = infoSide
	prev := fmt.Sprint(a["infoLastSide"])
	if prev == "above" || prev == "below" {
		if prev != infoSide {
			if infoSide == "below" {
				ev.InfoCrossing = "down"
			} else {
				ev.InfoCrossing = "up"
			}
		}
	}
	return ev
}

func buildEmaOverviewMessage(alerts []EmaEval) string {
	var near []EmaEval
	for _, a := range alerts {
		if a.DataOK && a.Near {
			near = append(near, a)
		}
	}
	if len(near) == 0 {
		return ""
	}
	var parts []string
	for _, a := range near {
		parts = append(parts, formatEmaAlertLine(a))
	}
	return "<pre>📐 EMA сигналы\n\nБлизко: " + strings.Join(parts, ", ") + "</pre>"
}

func buildEmaDecisionMessage(alerts []EmaEval) string {
	var reached, crossing []EmaEval
	for _, a := range alerts {
		if a.DataOK && a.Reached {
			reached = append(reached, a)
		}
		if a.DataOK && a.InfoCrossing != "" {
			crossing = append(crossing, a)
		}
	}
	if len(reached) == 0 && len(crossing) == 0 {
		return ""
	}
	lines := []string{"📐 EMA сигналы", ""}
	if len(reached) > 0 {
		lines = append(lines, "Достигнутые уровни:")
		for _, a := range reached {
			action := "ПОКУПАЙ"
			comp := "≤"
			if a.Action == "sell" {
				action = "ПРОДАВАЙ"
				comp = "≥"
			}
			lines = append(lines, fmt.Sprintf("  %s: %s EMA%d %.0f%%–%.0f%% • сейчас %.2f%% (%s %.0f%%)",
				action, a.Symbol, a.EmaPeriod, a.BuyLevelPct, a.SellLevelPct, a.DeviationPct, comp, a.ActiveLevelPct))
		}
	}
	if len(crossing) > 0 {
		if len(reached) > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, "Инфо-уровень:")
		for _, a := range crossing {
			if a.InfoCrossing == "down" {
				lines = append(lines, fmt.Sprintf("⚠️ %s пересёк %.0f%% от EMA%d вниз (отклонение %.2f%%)", a.Symbol, a.InfoLevelPct, a.EmaPeriod, a.DeviationPct))
			} else {
				lines = append(lines, fmt.Sprintf("%s вернулся выше %.0f%% от EMA%d (отклонение %.2f%%)", a.Symbol, a.InfoLevelPct, a.EmaPeriod, a.DeviationPct))
			}
		}
	}
	return "<pre>" + strings.Join(lines, "\n") + "</pre>"
}

func formatEmaAlertLine(a EmaEval) string {
	action := "покупай"
	comp := "≤"
	if a.Action == "sell" {
		action = "продавай"
		comp = "≥"
	}
	return fmt.Sprintf("%s EMA%d: %s при %s %.0f%% (сейчас %.2f%%)", a.Symbol, a.EmaPeriod, action, comp, a.ActiveLevelPct, a.DeviationPct)
}

func (e *Engine) persistEmaAfterSend(alerts []EmaEval, stage string) {
	now := e.now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
	if stage == "confirmations" {
		for _, a := range alerts {
			if a.DataOK && a.Reached && a.ID != "" {
				_ = e.DB.MarkEMATriggered(a.ID, a.Action, a.DeviationPct, now)
			}
		}
	}
	for _, a := range alerts {
		if a.DataOK && a.InfoCrossing != "" && a.InfoSide != "" && a.ID != "" {
			_ = e.DB.RecordEMAInfoSide(a.ID, a.InfoSide, now)
		}
	}
}
