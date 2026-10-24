package httpapi

import (
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

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
// The error matters: an unreadable split table looks exactly like "nothing
// stored", and every stored event would then be offered again as a new hint.
func (s *Server) detectSplitHints(id string, bars []types.OHLC) ([]types.SplitEvent, error) {
	if len(bars) == 0 {
		return []types.SplitEvent{}, nil
	}
	detected := splits.Detect(bars)
	stored, err := s.DB.ListSplits(id)
	if err != nil {
		return nil, err
	}
	return detectedNotStored(stored, detected), nil
}
