package live

import (
	"fmt"
	"math"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

var commonSplitFactors = []float64{2, 3, 4, 5, 7, 10, 20}

const (
	splitFactorTolerance = 0.08
	minSplitFactor       = 1.9
)

type IntegrityResult struct {
	OK, BlockSignals, Checked bool
	Symbol, Code              string
	PreviousDate, CurrentDate string
	PreviousClose, Current    float64
	FactorRatio               float64
	MatchedFactor             float64
	TelegramLines             []string
}

func (r IntegrityResult) key() string {
	return r.Symbol + "|" + r.Code + "|" + r.PreviousDate + "|" + r.CurrentDate
}

func EvaluatePriceIntegrity(symbol string, bars []types.OHLC, currentPrice float64, currentDate string, splits []types.SplitEvent, adjusted bool) IntegrityResult {
	symbol = store.SafeTicker(symbol)
	base := IntegrityResult{OK: true, Symbol: symbol, Current: currentPrice, CurrentDate: currentDate}
	var prev types.OHLC
	found := false
	for i := len(bars) - 1; i >= 0; i-- {
		if bars[i].Close > 0 {
			prev = bars[i]
			found = true
			break
		}
	}
	if !found || prev.Close <= 0 || currentPrice <= 0 {
		base.Checked = false
		return base
	}
	if !barsCoverPrevSession(bars, currentDate) {
		base.Checked = false
		return base
	}
	base.PreviousClose = prev.Close
	base.PreviousDate = string(prev.Date)
	if base.PreviousDate == currentDate && len(bars) >= 2 {
		for i := len(bars) - 2; i >= 0; i-- {
			if bars[i].Close > 0 {
				base.PreviousClose = bars[i].Close
				base.PreviousDate = string(bars[i].Date)
				break
			}
		}
	}
	down := base.PreviousClose / currentPrice
	up := currentPrice / base.PreviousClose
	factor := math.Max(down, up)
	base.FactorRatio = factor
	base.Checked = true
	matched := nearestSplitFactor(factor)
	base.MatchedFactor = matched
	known := knownSplitBoundary(base.PreviousDate, currentDate, matched, splits)
	splitLike := matched > 0
	extreme := factor >= minSplitFactor
	if !(splitLike || extreme) {
		return base
	}
	if known && !adjusted {
		return base
	}
	code := "suspicious_price_gap"
	if splitLike {
		code = "possible_split_or_mixed_adjustment"
	}
	if adjusted && known {
		code = "adjusted_dataset_split_gap"
	}
	out := base
	out.OK = false
	out.BlockSignals = true
	out.Code = code
	out.TelegramLines = integrityTelegramLines(out)
	return out
}

func barsCoverPrevSession(bars []types.OHLC, today string) bool {
	if len(bars) == 0 {
		return false
	}
	last := tradingdate.DateKey(bars[len(bars)-1].Date)
	prev := today
	for i := 0; i < 5; i++ {
		cand := tradingdate.AddDays(today, -1-i)
		if tradingdate.DayOfWeek(cand) == 0 || tradingdate.DayOfWeek(cand) == 6 {
			continue
		}
		prev = cand
		break
	}
	return last >= prev
}

func nearestSplitFactor(ratio float64) float64 {
	best := 0.0
	bestDist := 1.0
	for _, f := range commonSplitFactors {
		d := math.Abs(ratio/f - 1)
		if d <= splitFactorTolerance && d < bestDist {
			best, bestDist = f, d
		}
	}
	return best
}

func knownSplitBoundary(prevDate, curDate string, matched float64, splits []types.SplitEvent) bool {
	for _, ev := range splits {
		d := string(ev.Date)
		if !(d > prevDate && d <= curDate) {
			continue
		}
		if matched <= 0 {
			return true
		}
		ef := ev.Factor
		if ef < 1 && ef > 0 {
			ef = 1 / ef
		}
		if math.Abs(ef/matched-1) <= splitFactorTolerance {
			return true
		}
	}
	return false
}

func integrityTelegramLines(r IntegrityResult) []string {
	matched := "слишком большой разрыв"
	if r.MatchedFactor > 0 {
		matched = fmt.Sprintf("похоже на %.0f:1", r.MatchedFactor)
	}
	reason := "в ручных сплитах нет события, которое объясняет такой скачок"
	if r.Code == "adjusted_dataset_split_gap" {
		reason = "ряд помечен как split-adjusted, но цена всё равно скачет как при сплите"
	}
	return []string{
		fmt.Sprintf("%s: EMA/IBS сигналы заблокированы", r.Symbol),
		fmt.Sprintf("база %s: $%.2f", nz(r.PreviousDate), r.PreviousClose),
		fmt.Sprintf("сейчас %s: $%.2f", nz(r.CurrentDate), r.Current),
		fmt.Sprintf("отношение: x%.2f (%s)", r.FactorRatio, matched),
		"причина: " + reason,
	}
}

func FormatIntegrityWarningBlock(warnings []IntegrityResult) string {
	seen := map[string]struct{}{}
	var chunks []string
	for _, w := range warnings {
		if !w.BlockSignals {
			continue
		}
		k := w.key()
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		lines := w.TelegramLines
		if len(lines) == 0 {
			lines = integrityTelegramLines(w)
		}
		var b strings.Builder
		for i, line := range lines {
			if i == 0 {
				b.WriteString("• " + line)
			} else {
				b.WriteString("\n  " + line)
			}
		}
		chunks = append(chunks, b.String())
	}
	if len(chunks) == 0 {
		return ""
	}
	return "⚠️ ПРОВЕРКА ДАННЫХ\n" + strings.Join(chunks, "\n")
}

func nz(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
