package types

import (
	"encoding/json"
	"math"
)

func finiteOrNil(v float64) any {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return v
}

func (m PerformanceMetrics) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{
		"totalReturn":    finiteOrNil(m.TotalReturn),
		"cagr":           finiteOrNil(m.CAGR),
		"maxDrawdown":    finiteOrNil(m.MaxDrawdown),
		"winRate":        finiteOrNil(m.WinRate),
		"sharpeRatio":    finiteOrNil(m.SharpeRatio),
		"sortinoRatio":   finiteOrNil(m.SortinoRatio),
		"calmarRatio":    finiteOrNil(m.CalmarRatio),
		"profitFactor":   finiteOrNil(m.ProfitFactor),
		"averageWin":     finiteOrNil(m.AverageWin),
		"averageLoss":    finiteOrNil(m.AverageLoss),
		"beta":           finiteOrNil(m.Beta),
		"alpha":          finiteOrNil(m.Alpha),
		"recoveryFactor": finiteOrNil(m.RecoveryFactor),
		"skewness":       finiteOrNil(m.Skewness),
		"kurtosis":       finiteOrNil(m.Kurtosis),
		"valueAtRisk":    finiteOrNil(m.ValueAtRisk),
		"totalTrades":    m.TotalTrades,
	})
}

func (m BacktestMetrics) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{
		"totalReturn":       finiteOrNil(m.TotalReturn),
		"cagr":              finiteOrNil(m.CAGR),
		"winRate":           finiteOrNil(m.WinRate),
		"totalTrades":       m.TotalTrades,
		"winningTrades":     m.WinningTrades,
		"losingTrades":      m.LosingTrades,
		"profitFactor":      finiteOrNil(m.ProfitFactor),
		"netProfit":         finiteOrNil(m.NetProfit),
		"netReturn":         finiteOrNil(m.NetReturn),
		"maxDrawdown":       finiteOrNil(m.MaxDrawdown),
		"totalContribution": finiteOrNil(m.TotalContribution),
		"contributionCount": m.ContributionCount,
	})
}
