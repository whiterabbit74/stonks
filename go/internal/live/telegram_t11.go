package live

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func (e *Engine) buildT11Text(minutes int, today, provider string, rows []t1Watch, ema []EmaEval, integ []IntegrityResult) string {
	sorted := append([]t1Watch(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].sym < sorted[j].sym })
	open := e.openMonitorTrade()
	openSym := ""
	if open != nil {
		openSym = store.SafeTicker(fmt.Sprint(open["symbol"]))
	}
	abbrev := providerAbbrev(provider)
	closeHM, short := e.sessionCloseLabel()
	header := fmt.Sprintf("🕓 %s → close · %s ET (%s)%s", tgBold(fmt.Sprintf("%dm", minutes)), tgBold(closeHM), tgBold(today), shortSuffix(short))

	var entries, exits []string
	var body []string
	for _, r := range sorted {
		posOpen := openSym != "" && store.SafeTicker(r.sym) == openSym
		near := r.eval.nearEntry
		if posOpen {
			near = r.eval.nearExit
		}
		priceStr := formatMoneyDash(r.eval.price)
		ibsShort := "—"
		if r.eval.ok {
			ibsShort = formatIbsDot(r.eval.ibs, 2)
		}
		if r.eval.ok && near && !r.eval.blocked {
			item := fmt.Sprintf("%s · IBS %s", tgBold(r.sym), tgBold(formatIbsDot(r.eval.ibs, 3)))
			if posOpen {
				exits = append(exits, item)
			} else {
				entries = append(entries, item)
			}
		}
		posLabel := "FLAT"
		if posOpen {
			posLabel = "OPEN"
		}
		line1 := fmt.Sprintf("%s %s · %s · IBS %s", tgBold(r.sym), tgBold(priceStr), posLabel, tgBold(ibsShort))
		bar := ibsBar(r.eval.ibs, r.eval.ok)
		fresh := abbrev + freshMark(r.eval.histFresh) + " RT" + freshMark(r.eval.rtFresh)
		tag := ""
		if r.eval.blocked {
			tag = "⚠️"
		} else if r.eval.ok && near {
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

	entryLine := "ENTRY: —"
	if len(entries) > 0 {
		entryLine = "🔔 ENTRY: " + strings.Join(entries, ", ")
	}
	exitLine := "EXIT: —"
	if len(exits) > 0 {
		exitLine = "🔔 EXIT: " + strings.Join(exits, ", ")
	}

	parts := []string{header, entryLine, exitLine}
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
	// snap holds map[string]any values: a nil map stored in an interface is not
	// == nil, so a plain nil check reported OPEN/OPEN on every warning, whatever
	// the books actually said.
	mon, bro := "FLAT", "FLAT"
	if len(mapOf(snap["openMonitorTrade"])) > 0 {
		mon = "OPEN"
	}
	if len(mapOf(snap["openBrokerTrade"])) > 0 {
		bro = "OPEN"
	}
	reconcile := "auto-reconcile unsafe"
	if issue["autoFixable"] == true {
		reconcile = "auto-reconcile available"
	}
	return fmt.Sprintf("⚠️ %s: monitor %s · broker %s · %s", tgBold(symbol), mon, bro, reconcile)
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
	closeMin, short := e.sessionCloseMin()
	return fmt.Sprintf("%02d:%02d", closeMin/60, closeMin%60), short
}

// sessionCloseMin returns today's NYSE close as minutes past midnight ET,
// honouring the calendar's short days the way scheduler.TradingSession does.
func (e *Engine) sessionCloseMin() (int, bool) {
	closeMin := 16 * 60
	short := false
	raw, _ := e.DB.GetCalendar()
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
		_ = json.Unmarshal(raw, &cal)
		if hm := parseClock(cal.TradingHours.Normal.End); hm > 0 {
			closeMin = hm
		}
		p := tradingdate.CurrentTimeNYSE(e.now())
		y := fmt.Sprintf("%d", p.Year)
		mmdd := fmt.Sprintf("%02d-%02d", p.Month, p.Day)
		if yearMap := cal.ShortDays[y]; yearMap != nil {
			if _, ok := yearMap[mmdd]; ok {
				short = true
				if hm := parseClock(cal.TradingHours.Short.End); hm > 0 {
					closeMin = hm
				} else {
					closeMin = 13 * 60
				}
			}
		}
	}
	return closeMin, short
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

func tgBold(s string) string { return "<b>" + s + "</b>" }

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
