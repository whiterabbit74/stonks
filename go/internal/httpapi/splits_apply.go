package httpapi

import (
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func mergeSplitEvents(stored, detected []types.SplitEvent) []types.SplitEvent {
	byDate := make(map[string]types.SplitEvent, len(stored)+len(detected))
	add := func(list []types.SplitEvent, overwrite bool) {
		for _, e := range list {
			if e.Date == "" || e.Factor <= 0 || e.Factor == 1 {
				continue
			}
			date := tradingdate.DateKey(e.Date)
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
		have[tradingdate.DateKey(e.Date)] = true
	}
	var out []types.SplitEvent
	for _, e := range detected {
		date := tradingdate.DateKey(e.Date)
		if date == "" || have[date] {
			continue
		}
		out = append(out, types.SplitEvent{Date: date, Factor: e.Factor})
	}
	if out == nil {
		out = []types.SplitEvent{}
	}
	return out
}

// detectSplitHints returns Detect results not already stored.
// GET/save/refresh must not persist guessed splits or mutate history.
func (s *Server) detectSplitHints(id string, bars []types.OHLC) []types.SplitEvent {
	if len(bars) == 0 {
		return []types.SplitEvent{}
	}
	detected := splits.Detect(bars)
	stored, _ := s.DB.ListSplits(id)
	return detectedNotStored(stored, detected)
}

// applyStoredSplits back-adjusts using confirmed stored events only.
func (s *Server) applyStoredSplits(id string, bars []types.OHLC) ([]types.OHLC, bool) {
	events, _ := s.DB.ListSplits(id)
	if len(events) == 0 || len(bars) == 0 {
		return bars, false
	}
	out := splits.AdjustOHLC(bars, events)
	return out, !pricesUnchanged(bars, out)
}

func (s *Server) persistDataset(id string, ds map[string]any, bars []types.OHLC, adjusted bool) error {
	name := str(ds["name"])
	if name == "" {
		name = id
	}
	return s.DB.SaveDataset(id, name, strPtr(ds["companyName"]), strPtr(ds["tag"]), bars, adjusted)
}
