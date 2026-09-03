package httpapi

import (
	"encoding/json"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func jsonBytes(v any) ([]byte, error) {
	switch t := v.(type) {
	case nil:
		return nil, nil
	case json.RawMessage:
		return t, nil
	case []byte:
		return t, nil
	default:
		return json.Marshal(v)
	}
}

func decodeBars(v any) []types.OHLC {
	if bars, ok := v.([]types.OHLC); ok {
		return normalizeBarDates(bars)
	}
	raw, err := jsonBytes(v)
	if err != nil || len(raw) == 0 {
		return nil
	}
	var bars []types.OHLC
	if json.Unmarshal(raw, &bars) != nil {
		return nil
	}
	return normalizeBarDates(bars)
}

func normalizeBarDates(bars []types.OHLC) []types.OHLC {
	for i := range bars {
		bars[i].Date = tradingdate.DateKey(bars[i].Date)
	}
	return bars
}

func decodeStrategy(v any) types.Strategy {
	def := types.DefaultIBSStrategy()
	raw, err := jsonBytes(v)
	if err != nil || len(raw) == 0 {
		return def
	}
	var s types.Strategy
	if json.Unmarshal(raw, &s) != nil {
		return def
	}
	if s.ID == "" {
		s.ID = def.ID
	}
	if s.Name == "" {
		s.Name = def.Name
	}
	if s.Type == "" {
		s.Type = def.Type
	}
	if s.Description == "" {
		s.Description = def.Description
	}
	if s.EntryConditions == nil {
		s.EntryConditions = def.EntryConditions
	}
	if s.ExitConditions == nil {
		s.ExitConditions = def.ExitConditions
	}
	if s.PositionSizing.Type == "" {
		s.PositionSizing = def.PositionSizing
	}
	if s.RiskManagement.Commission.Type == "" {
		s.RiskManagement.Commission = def.RiskManagement.Commission
	}
	return s
}

func decodeTrades(v any) []types.Trade {
	raw, err := jsonBytes(v)
	if err != nil || len(raw) == 0 {
		return nil
	}
	var t []types.Trade
	_ = json.Unmarshal(raw, &t)
	return t
}

func toSplits(events []map[string]any) []types.SplitEvent {
	out := make([]types.SplitEvent, 0, len(events))
	for _, e := range events {
		date := str(e["date"])
		factor, _ := e["factor"].(float64)
		if date == "" || factor == 0 {
			continue
		}
		out = append(out, types.SplitEvent{Date: date, Factor: factor})
	}
	return out
}
