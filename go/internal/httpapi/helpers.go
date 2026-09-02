package httpapi

import (
	"encoding/json"

	"mktorder.com/go/internal/types"
)

func decodeBars(v any) []types.OHLC {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var bars []types.OHLC
	if err := json.Unmarshal(b, &bars); err != nil {
		return nil
	}
	for i := range bars {
		if len(bars[i].Date) >= 10 {
			bars[i].Date = bars[i].Date[:10]
		}
	}
	return bars
}

func decodeStrategy(v any) types.Strategy {
	s := types.DefaultIBSStrategy()
	if v == nil {
		return s
	}
	b, err := json.Marshal(v)
	if err != nil {
		return s
	}
	_ = json.Unmarshal(b, &s)
	if s.Parameters.LowIBS == 0 {
		s.Parameters.LowIBS = 0.1
	}
	if s.Parameters.HighIBS == 0 {
		s.Parameters.HighIBS = 0.75
	}
	if s.RiskManagement.InitialCapital == 0 {
		s.RiskManagement.InitialCapital = 10000
	}
	if s.RiskManagement.CapitalUsage == 0 {
		s.RiskManagement.CapitalUsage = 100
	}
	return s
}

func decodeTrades(v any) []types.Trade {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var t []types.Trade
	_ = json.Unmarshal(b, &t)
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
