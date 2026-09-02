package httpapi

import (
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/types"
)

func splitDate(d string) string {
	if len(d) >= 10 {
		return d[:10]
	}
	return d
}

func mergeSplitEvents(stored, detected []types.SplitEvent) []types.SplitEvent {
	byDate := make(map[string]types.SplitEvent, len(stored)+len(detected))
	add := func(list []types.SplitEvent, overwrite bool) {
		for _, e := range list {
			if e.Date == "" || e.Factor <= 0 || e.Factor == 1 {
				continue
			}
			date := splitDate(e.Date)
			if !overwrite {
				if _, ok := byDate[date]; ok {
					continue
				}
			}
			byDate[date] = types.SplitEvent{Date: date, Factor: e.Factor}
		}
	}
	add(detected, true)
	add(stored, true)
	out := make([]types.SplitEvent, 0, len(byDate))
	for _, e := range byDate {
		out = append(out, e)
	}
	return out
}

func detectedNotStored(stored, detected []types.SplitEvent) []types.SplitEvent {
	have := make(map[string]bool, len(stored))
	for _, e := range stored {
		have[splitDate(e.Date)] = true
	}
	var out []types.SplitEvent
	for _, e := range detected {
		date := splitDate(e.Date)
		if date == "" || have[date] {
			continue
		}
		out = append(out, types.SplitEvent{Date: date, Factor: e.Factor})
	}
	return out
}

// adjustBarsIfNeeded back-adjusts raw OHLC when Detect finds split cliffs.
// Already-adjusted series (flag set, or no cliffs left) are left untouched so
// a second pass cannot divide prices again.
func (s *Server) adjustBarsIfNeeded(id string, bars []types.OHLC, alreadyAdjusted bool) ([]types.OHLC, bool) {
	if len(bars) == 0 {
		return bars, alreadyAdjusted
	}
	detected := splits.Detect(bars)
	stored, _ := s.DB.ListSplits(id)
	if alreadyAdjusted {
		return bars, true
	}
	if len(detected) == 0 {
		return bars, len(stored) > 0
	}
	events := mergeSplitEvents(stored, detected)
	if missing := detectedNotStored(stored, detected); len(missing) > 0 {
		_ = s.DB.UpsertSplits(id, missing)
	}
	return splits.AdjustOHLC(bars, events), true
}

func (s *Server) persistDataset(id string, ds map[string]any, bars []types.OHLC, adjusted bool) error {
	name := str(ds["name"])
	if name == "" {
		name = id
	}
	return s.DB.SaveDataset(id, name, strPtr(ds["companyName"]), strPtr(ds["tag"]), bars, adjusted)
}
