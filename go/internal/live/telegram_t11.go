package live

import (
	"encoding/json"
	"fmt"
	"html"
	"math"
	"sort"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func (e *Engine) buildT11Text(minutes int, today, provider string, rows []t1Watch, ema []EmaEval, integ []IntegrityResult) string {
	sorted := append([]t1Watch(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].sym < sorted[j].sym })
	open, tradesErr := e.openPosition()
	openSym := ""
	if open != nil {
		openSym = open.Symbol
	}
	abbrev := providerAbbrev(provider)
	closeHM, short := e.sessionCloseLabel()
	header := fmt.Sprintf("🕓 %s → close · %s ET (%s)%s", tgBold(fmt.Sprintf("%dm", minutes)), tgBold(closeHM), tgBold(today), shortSuffix(short))

	var exits []string
	var body []string
	for _, r := range sorted {
		posOpen := openSym != "" && store.SafeTicker(r.sym) == openSym
		// Strictly the same signal the engine acts on: an IBS merely close to
		// the threshold used to be tagged ENTRY here and then, correctly, not
		// traded at T-1, which reads as a bot that changed its mind.
		signal := r.eval.entry
		if posOpen {
			signal = r.eval.exit
		}
		priceStr := formatMoneyDash(r.eval.price)
		ibsShort := "—"
		if r.eval.ok {
			ibsShort = formatIbsDot(r.eval.ibs, 2)
		}
		if posOpen && signal && !r.eval.blocked {
			exits = append(exits, fmt.Sprintf("%s · IBS %s", tgBold(r.sym), tgBold(formatIbsDot(r.eval.ibs, 3))))
		}
		posLabel := "FLAT"
		if posOpen {
			posLabel = "OPEN"
		} else if tradesErr != nil {
			posLabel = "?"
		}
		line1 := fmt.Sprintf("%s %s · %s · IBS %s", tgBold(r.sym), tgBold(priceStr), posLabel, tgBold(ibsShort))
		bar := ibsBar(r.eval.ibs, r.eval.ok)
		fresh := abbrev + freshMark(r.eval.histFresh) + " RT" + freshMark(r.eval.rtFresh)
		tag := ""
		if r.eval.blocked {
			tag = "⚠️"
		} else if signal {
			if posOpen {
				tag = "EXIT"
			} else {
				tag = "ENTRY"
			}
		}
		line2 := fmt.Sprintf("[%s] · %s", bar, fresh)
		if tag != "" {
			line2 += " · " + tag
		}
		body = append(body, line1+"\n"+line2)
	}

	// "the ticker that would be picked if the session ended now" — the lowest
	// IBS strictly below its threshold, the same pick decideLiveAction makes.
	// Still shown while a position is open: T-1 exits and re-enters inside one
	// cycle, so the candidate is exactly what happens after the exit fills.
	entryLine := "ENTRY: —"
	if sym, ibsVal, ok := bestEntryRow(sorted); ok {
		entryLine = fmt.Sprintf("🔔 ENTRY: %s · IBS %s", tgBold(sym), tgBold(formatIbsDot(ibsVal, 3)))
	}
	exitLine := "EXIT: —"
	if len(exits) > 0 {
		exitLine = "🔔 EXIT: " + strings.Join(exits, ", ")
	}

	parts := []string{header, entryLine, exitLine}
	if tradesErr != nil {
		parts = append(parts, "⚠️ Журнал сделок недоступен — позиции не показаны")
	}
	if block := FormatIntegrityWarningBlock(integ); block != "" {
		parts = append(parts, "", block)
	}
	snap := e.Consistency()
	if issues, ok := snap["issues"].([]map[string]any); ok {
		for _, issue := range issues {
			parts = append(parts, formatConsistencyIssueLine(issue, snap))
		}
	}
	if len(body) > 0 {
		parts = append(parts, "")
		parts = append(parts, body...)
	}
	if inline := buildEmaInlineBlock(ema); inline != "" {
		parts = append(parts, inline)
	}
	return strings.Join(parts, "\n")
}

func formatConsistencyIssueLine(issue, snap map[string]any) string {
	symbol := fmt.Sprint(issue["symbol"])
	if symbol == "" || symbol == "<nil>" {
		symbol = "?"
	}
	msg := fmt.Sprint(issue["message"])
	if msg == "" || msg == "<nil>" {
		msg = fmt.Sprint(issue["code"])
	}
	return fmt.Sprintf("⚠️ %s: %s", tgBold(symbol), msg)
}

// snap holds map[string]any values: a nil map stored in an interface is not
// == nil, so a plain nil check reported OPEN/OPEN on every warning, whatever
// the books actually said. An unreadable journal carries no trade keys at all —
// "FLAT" there would state a fact the read never produced.
func tradeStateLabel(snap map[string]any, key string) string {
	v, ok := snap[key]
	if !ok {
		return "?"
	}
	if len(mapOf(v)) > 0 {
		return "OPEN"
	}
	return "FLAT"
}

func buildEmaInlineBlock(alerts []EmaEval) string {
	if len(alerts) == 0 {
		return ""
	}
	var lines []string
	for _, a := range alerts {
		if !a.DataOK {
			lines = append(lines, "EMA: "+tgBold(a.Symbol)+" —")
			continue
		}
		action, comp := "buy", "≤"
		if a.Action == "sell" {
			action, comp = "sell", "≥"
		}
		prox := "far"
		if a.Near {
			prox = "near"
		}
		lines = append(lines, fmt.Sprintf("EMA: %s %s → %s %s%.0f%% · %s", tgBold(a.Symbol), tgBold(fmt.Sprintf("%.2f%%", a.DeviationPct)), action, comp, a.ActiveLevelPct, prox))
		if a.InfoCrossing == "down" {
			lines = append(lines, fmt.Sprintf("⚠️ %s пересёк %.0f%% от EMA%d вниз (отклонение %.2f%%)", a.Symbol, a.InfoLevelPct, a.EmaPeriod, a.DeviationPct))
		} else if a.InfoCrossing == "up" {
			lines = append(lines, fmt.Sprintf("%s вернулся выше %.0f%% от EMA%d (отклонение %.2f%%)", a.Symbol, a.InfoLevelPct, a.EmaPeriod, a.DeviationPct))
		}
	}
	return strings.Join(lines, "\n")
}

func (e *Engine) sessionCloseLabel() (string, bool) {
	closeMin, short, _ := e.sessionCloseMin()
	return fmt.Sprintf("%02d:%02d", closeMin/60, closeMin%60), short
}

// sessionCloseMin returns today's NYSE close as minutes past midnight ET,
// honouring the calendar's short days the way scheduler.TradingSession does.
// A read or parse failure is reported instead of being papered over with the
// 16:00 default: on a short day that default is three hours late, and the
// callers that gate orders must refuse rather than guess.
func (e *Engine) sessionCloseMin() (int, bool, error) {
	closeMin := 16 * 60
	short := false
	raw, err := e.DB.GetCalendar()
	if err != nil {
		return closeMin, short, err
	}
	if len(raw) > 0 {
		var cal struct {
			ShortDays    map[string]map[string]any `json:"shortDays"`
			TradingHours struct {
				Normal struct {
					End string `json:"end"`
				} `json:"normal"`
				Short struct {
					End string `json:"end"`
				} `json:"short"`
			} `json:"tradingHours"`
		}
		if err := json.Unmarshal(raw, &cal); err != nil {
			return closeMin, short, err
		}
		if hm := parseClock(cal.TradingHours.Normal.End); hm > 0 {
			closeMin = hm
		}
		p := tradingdate.CurrentTimeNYSE(e.now())
		y := fmt.Sprintf("%d", p.Year)
		mmdd := fmt.Sprintf("%02d-%02d", p.Month, p.Day)
		// Same rule as scheduler.IsShortDay: a year present in the map is the
		// whole truth for that year, a year the calendar never covered falls
		// back to the computed early closes. Without the fallback the scheduler
		// ran T-11/T-1 against a 13:00 close while this close said 16:00, which
		// mislabels the message and hands the T-1 retry budget three extra hours.
		if yearMap, ok := cal.ShortDays[y]; ok && yearMap != nil {
			_, short = yearMap[mmdd]
		} else {
			short = tradingdate.IsComputedShortDay(tradingdate.NYSEPartsDate(p))
		}
		if short {
			if hm := parseClock(cal.TradingHours.Short.End); hm > 0 {
				closeMin = hm
			} else {
				closeMin = 13 * 60
			}
		}
	}
	return closeMin, short, nil
}

func parseClock(hm string) int {
	if hm == "" {
		return 0
	}
	var h, m int
	if _, err := fmt.Sscanf(hm, "%d:%d", &h, &m); err != nil {
		return 0
	}
	return h*60 + m
}

func providerAbbrev(p string) string {
	var parts []string
	for _, raw := range strings.Split(p, "+") {
		switch strings.ToLower(strings.TrimSpace(raw)) {
		case "finnhub":
			parts = append(parts, "FH")
		case "twelve_data":
			parts = append(parts, "TD")
		case "alpha_vantage":
			parts = append(parts, "AV")
		case "webull":
			parts = append(parts, "WB")
		case "polygon":
			parts = append(parts, "PG")
		case "":
		default:
			parts = append(parts, "RT")
		}
	}
	if len(parts) == 0 {
		return "RT"
	}
	return strings.Join(parts, "+")
}

func tgBold(s string) string { return "<b>" + html.EscapeString(s) + "</b>" }

func shortSuffix(short bool) string {
	if short {
		return " short"
	}
	return ""
}

func formatMoneyDash(n float64) string {
	if n > 0 {
		return fmt.Sprintf("$%.2f", n)
	}
	return "-"
}

func formatIbsDot(v float64, digits int) string {
	s := fmt.Sprintf("%.*f", digits, v)
	if i := strings.IndexByte(s, '.'); i >= 0 {
		return "." + s[i+1:]
	}
	return s
}

func freshMark(ok bool) string {
	if ok {
		return "✓"
	}
	return "✗"
}

func ibsBar(ibs float64, ok bool) string {
	if !ok {
		return strings.Repeat("░", 10)
	}
	fill := int(math.Ceil(ibs * 11))
	if fill < 0 {
		fill = 0
	}
	if fill > 10 {
		fill = 10
	}
	return strings.Repeat("█", fill) + strings.Repeat("░", 10-fill)
}
