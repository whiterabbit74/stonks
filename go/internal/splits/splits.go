package splits

import (
	"math"
	"sort"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func roundPrice(value float64) float64 {
	return math.Round(value*1000000) / 1000000
}

func normalize(splits []types.SplitEvent) []types.SplitEvent {
	byDate := map[string]types.SplitEvent{}
	for _, s := range splits {
		if s.Date == "" || !isFinite(s.Factor) || s.Factor <= 0 || s.Factor == 1 {
			continue
		}
		date := s.Date
		if len(date) >= 10 {
			date = date[:10]
		}
		byDate[date] = types.SplitEvent{Date: date, Factor: s.Factor}
	}
	out := make([]types.SplitEvent, 0, len(byDate))
	for _, v := range byDate {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func AdjustOHLC(ohlc []types.OHLC, splitsIn []types.SplitEvent) []types.OHLC {
	if len(ohlc) == 0 || len(splitsIn) == 0 {
		return ohlc
	}
	data := append([]types.OHLC(nil), ohlc...)
	sort.Slice(data, func(i, j int) bool {
		return tradingdate.Compare(data[i].Date, data[j].Date) < 0
	})
	events := normalize(splitsIn)
	if len(events) == 0 {
		return ohlc
	}
	result := make([]types.OHLC, len(data))
	for i, bar := range data {
		cumulative := 1.0
		for _, event := range events {
			if tradingdate.Compare(bar.Date, event.Date) < 0 {
				cumulative *= event.Factor
			}
		}
		out := bar
		if cumulative != 1 {
			out.Open = roundPrice(bar.Open / cumulative)
			out.High = roundPrice(bar.High / cumulative)
			out.Low = roundPrice(bar.Low / cumulative)
			out.Close = roundPrice(bar.Close / cumulative)
			adj := bar.Close
			if bar.AdjClose != nil {
				adj = *bar.AdjClose
			}
			v := roundPrice(adj / cumulative)
			out.AdjClose = &v
			out.Volume = math.Round(bar.Volume * cumulative)
		}
		result[i] = out
	}
	return result
}

func Detect(ohlc []types.OHLC) []types.SplitEvent {
	if len(ohlc) < 2 {
		return nil
	}
	factors := []float64{2, 3, 4, 5, 7, 10, 20, 1.5, 0.5, 0.333, 0.25, 0.2, 0.1}
	data := append([]types.OHLC(nil), ohlc...)
	sort.Slice(data, func(i, j int) bool { return data[i].Date < data[j].Date })
	var out []types.SplitEvent
	for i := 1; i < len(data); i++ {
		prev, curr := data[i-1], data[i]
		if curr.Open == 0 || !isFinite(prev.Close) || !isFinite(curr.Open) {
			continue
		}
		ratio := prev.Close / curr.Open
		for _, candidate := range factors {
			if math.Abs(ratio-candidate) < 0.05 {
				out = append(out, types.SplitEvent{Date: curr.Date, Factor: candidate})
				break
			}
		}
	}
	return out
}

func ApplyHolderValue(ohlc []types.OHLC, splitsIn []types.SplitEvent) []types.OHLC {
	if len(ohlc) == 0 {
		return ohlc
	}
	data := append([]types.OHLC(nil), ohlc...)
	sort.Slice(data, func(i, j int) bool { return data[i].Date < data[j].Date })
	events := normalize(splitsIn)
	splitIndex := 0
	cumulative := 1.0
	out := make([]types.OHLC, len(data))
	for i, bar := range data {
		for splitIndex < len(events) && tradingdate.Compare(events[splitIndex].Date, bar.Date) <= 0 {
			cumulative *= events[splitIndex].Factor
			splitIndex++
		}
		rawO, rawH, rawL, rawC := bar.Open, bar.High, bar.Low, bar.Close
		if bar.RawOpen != nil {
			rawO = *bar.RawOpen
		}
		if bar.RawHigh != nil {
			rawH = *bar.RawHigh
		}
		if bar.RawLow != nil {
			rawL = *bar.RawLow
		}
		if bar.RawClose != nil {
			rawC = *bar.RawClose
		}
		item := bar
		item.RawOpen, item.RawHigh, item.RawLow, item.RawClose = &rawO, &rawH, &rawL, &rawC
		item.Open = roundPrice(bar.Open * cumulative)
		item.High = roundPrice(bar.High * cumulative)
		item.Low = roundPrice(bar.Low * cumulative)
		item.Close = roundPrice(bar.Close * cumulative)
		if bar.AdjClose != nil {
			v := roundPrice(*bar.AdjClose * cumulative)
			item.AdjClose = &v
		}
		sf := roundPrice(cumulative)
		item.SplitFactor = &sf
		if len(events) > 0 {
			item.PriceBasis = "holder_value"
		} else {
			item.PriceBasis = "raw"
		}
		out[i] = item
	}
	return out
}
