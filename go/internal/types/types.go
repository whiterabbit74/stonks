package types

type OHLC struct {
	Date        string   `json:"date"`
	Open        float64  `json:"open"`
	High        float64  `json:"high"`
	Low         float64  `json:"low"`
	Close       float64  `json:"close"`
	AdjClose    *float64 `json:"adjClose,omitempty"`
	Volume      float64  `json:"volume"`
	RawOpen     *float64 `json:"rawOpen,omitempty"`
	RawHigh     *float64 `json:"rawHigh,omitempty"`
	RawLow      *float64 `json:"rawLow,omitempty"`
	RawClose    *float64 `json:"rawClose,omitempty"`
	SplitFactor *float64 `json:"splitFactor,omitempty"`
	PriceBasis  string   `json:"priceBasis,omitempty"`
}

type SplitEvent struct {
	Date   string  `json:"date"`
	Factor float64 `json:"factor"`
}

type Strategy struct {
	ID              string             `json:"id"`
	Name            string             `json:"name"`
	Description     string             `json:"description"`
	Type            string             `json:"type"`
	Parameters      StrategyParameters `json:"parameters"`
	EntryConditions []Condition        `json:"entryConditions"`
	ExitConditions  []Condition        `json:"exitConditions"`
	RiskManagement  RiskManagement     `json:"riskManagement"`
	PositionSizing  PositionSizing     `json:"positionSizing"`
}

type StrategyParameters struct {
	LowIBS      float64 `json:"lowIBS"`
	HighIBS     float64 `json:"highIBS"`
	MaxHoldDays float64 `json:"maxHoldDays"`
}

type Condition struct {
	Type      string      `json:"type"`
	Indicator string      `json:"indicator,omitempty"`
	Operator  string      `json:"operator"`
	Value     interface{} `json:"value"`
	Period    *int        `json:"period,omitempty"`
	Lookback  *int        `json:"lookback,omitempty"`
}

type RiskManagement struct {
	InitialCapital float64    `json:"initialCapital"`
	CapitalUsage   float64    `json:"capitalUsage"`
	Leverage       float64    `json:"leverage"`
	MaxPositionSize float64   `json:"maxPositionSize"`
	StopLoss       float64    `json:"stopLoss"`
	TakeProfit     float64    `json:"takeProfit"`
	UseStopLoss    bool       `json:"useStopLoss"`
	UseTakeProfit  bool       `json:"useTakeProfit"`
	MaxPositions   float64    `json:"maxPositions"`
	MaxHoldDays    float64    `json:"maxHoldDays"`
	Commission     Commission `json:"commission"`
	Slippage       float64    `json:"slippage"`
}

type Commission struct {
	Type       string   `json:"type"`
	Fixed      float64  `json:"fixed,omitempty"`
	Percentage float64  `json:"percentage,omitempty"`
}

type PositionSizing struct {
	Type  string  `json:"type"`
	Value float64 `json:"value"`
}

type TradeContext struct {
	Ticker                   string             `json:"ticker,omitempty"`
	MarketConditions         string             `json:"marketConditions,omitempty"`
	IndicatorValues          map[string]float64 `json:"indicatorValues,omitempty"`
	Volatility               float64            `json:"volatility,omitempty"`
	Trend                    string             `json:"trend,omitempty"`
	GrossProceeds            float64            `json:"grossProceeds,omitempty"`
	GrossCost                float64            `json:"grossCost,omitempty"`
	TotalCommissions         float64            `json:"totalCommissions,omitempty"`
	CommissionPaid           float64            `json:"commissionPaid,omitempty"`
	CurrentCapitalAfterExit  float64            `json:"currentCapitalAfterExit,omitempty"`
	CapitalBeforeExit        float64            `json:"capitalBeforeExit,omitempty"`
	InitialInvestment        float64            `json:"initialInvestment,omitempty"`
	GrossInvestment          float64            `json:"grossInvestment,omitempty"`
	Leverage                 float64            `json:"leverage,omitempty"`
	LeverageDebt             float64            `json:"leverageDebt,omitempty"`
	NetProceeds              float64            `json:"netProceeds,omitempty"`
	MarginUsed               float64            `json:"marginUsed,omitempty"`
	MarginTriggerType        string             `json:"marginTriggerType,omitempty"`
	MaintenanceMarginPct     float64            `json:"maintenanceMarginPct,omitempty"`
	MarginRatioAtTrigger     float64            `json:"marginRatioAtTrigger,omitempty"`
	StopLoss                 float64            `json:"stopLoss,omitempty"`
	TakeProfit               float64            `json:"takeProfit,omitempty"`
	PriceBasis               string             `json:"priceBasis,omitempty"`
	PriceBasisLabel          string             `json:"priceBasisLabel,omitempty"`
	QuantityBasis            string             `json:"quantityBasis,omitempty"`
	EntryRawClose            *float64           `json:"entryRawClose,omitempty"`
	ExitRawClose             *float64           `json:"exitRawClose,omitempty"`
	EntryIndexPrice          float64            `json:"entryIndexPrice,omitempty"`
	ExitIndexPrice           float64            `json:"exitIndexPrice,omitempty"`
}

type Trade struct {
	ID          string        `json:"id"`
	EntryDate   string        `json:"entryDate"`
	ExitDate    string        `json:"exitDate"`
	EntryPrice  float64       `json:"entryPrice"`
	ExitPrice   float64       `json:"exitPrice"`
	Quantity    float64       `json:"quantity"`
	PnL         float64       `json:"pnl"`
	PnLPercent  float64       `json:"pnlPercent"`
	Duration    int           `json:"duration"`
	ExitReason  string        `json:"exitReason"`
	Context     *TradeContext `json:"context,omitempty"`
	OptionType  string        `json:"optionType,omitempty"`
	Strike      float64       `json:"strike,omitempty"`
	ExpirationDate string     `json:"expirationDate,omitempty"`
	ImpliedVolAtEntry float64 `json:"impliedVolAtEntry,omitempty"`
	ImpliedVolAtExit  float64 `json:"impliedVolAtExit,omitempty"`
	OptionEntryPrice  float64 `json:"optionEntryPrice,omitempty"`
	OptionExitPrice   float64 `json:"optionExitPrice,omitempty"`
	Contracts         float64 `json:"contracts,omitempty"`
}

type EquityPoint struct {
	Date     string  `json:"date"`
	Value    float64 `json:"value"`
	Drawdown float64 `json:"drawdown"`
}

type ExposurePoint struct {
	Date            string  `json:"date"`
	Equity          float64 `json:"equity"`
	PositionValue   float64 `json:"positionValue"`
	ExposurePct     float64 `json:"exposurePct"`
	ActivePositions int     `json:"activePositions"`
}

type ChartCandle struct {
	Time  int64   `json:"time"`
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

type PerformanceMetrics struct {
	TotalReturn    float64 `json:"totalReturn"`
	CAGR           float64 `json:"cagr"`
	MaxDrawdown    float64 `json:"maxDrawdown"`
	WinRate        float64 `json:"winRate"`
	SharpeRatio    float64 `json:"sharpeRatio"`
	SortinoRatio   float64 `json:"sortinoRatio"`
	CalmarRatio    float64 `json:"calmarRatio"`
	ProfitFactor   float64 `json:"profitFactor"`
	AverageWin     float64 `json:"averageWin"`
	AverageLoss    float64 `json:"averageLoss"`
	Beta           float64 `json:"beta"`
	Alpha          float64 `json:"alpha"`
	RecoveryFactor float64 `json:"recoveryFactor"`
	Skewness       float64 `json:"skewness"`
	Kurtosis       float64 `json:"kurtosis"`
	ValueAtRisk    float64 `json:"valueAtRisk"`
	TotalTrades    int     `json:"totalTrades"`
}

type BacktestMetrics struct {
	TotalReturn        float64 `json:"totalReturn"`
	CAGR               float64 `json:"cagr"`
	WinRate            float64 `json:"winRate"`
	TotalTrades        int     `json:"totalTrades"`
	WinningTrades      int     `json:"winningTrades"`
	LosingTrades       int     `json:"losingTrades"`
	ProfitFactor       float64 `json:"profitFactor"`
	NetProfit          float64 `json:"netProfit"`
	NetReturn          float64 `json:"netReturn"`
	MaxDrawdown        float64 `json:"maxDrawdown"`
	TotalContribution  float64 `json:"totalContribution"`
	ContributionCount  int     `json:"contributionCount"`
}

type BacktestResult struct {
	Trades    []Trade             `json:"trades"`
	Metrics   PerformanceMetrics  `json:"metrics"`
	Equity    []EquityPoint       `json:"equity"`
	Exposure  []ExposurePoint     `json:"exposure,omitempty"`
	ChartData []ChartCandle       `json:"chartData,omitempty"`
	Insights  []interface{}       `json:"insights,omitempty"`
}

type CompactTrade struct {
	ID          string   `json:"id"`
	EntryDate   string   `json:"entryDate"`
	ExitDate    string   `json:"exitDate"`
	EntryPrice  float64  `json:"entryPrice"`
	ExitPrice   float64  `json:"exitPrice"`
	Quantity    float64  `json:"quantity"`
	PnL         float64  `json:"pnl"`
	PnLPercent  float64  `json:"pnlPercent"`
	Duration    int      `json:"duration"`
	ExitReason  string   `json:"exitReason"`
	Ticker      *string  `json:"ticker"`
	EntryIBS    *float64 `json:"entryIBS"`
	ExitIBS     *float64 `json:"exitIBS"`
}

func Compact(t Trade) CompactTrade {
	c := CompactTrade{
		ID: t.ID, EntryDate: t.EntryDate, ExitDate: t.ExitDate,
		EntryPrice: t.EntryPrice, ExitPrice: t.ExitPrice, Quantity: t.Quantity,
		PnL: t.PnL, PnLPercent: t.PnLPercent, Duration: t.Duration, ExitReason: t.ExitReason,
	}
	if t.Context != nil {
		if t.Context.Ticker != "" {
			s := t.Context.Ticker
			c.Ticker = &s
		}
		if t.Context.IndicatorValues != nil {
			if v, ok := t.Context.IndicatorValues["IBS"]; ok {
				vv := v
				c.EntryIBS = &vv
			}
			if v, ok := t.Context.IndicatorValues["exitIBS"]; ok {
				vv := v
				c.ExitIBS = &vv
			}
			if v, ok := t.Context.IndicatorValues["entryDeviationPct"]; ok && c.EntryIBS == nil {
				_ = v
			}
		}
	}
	return c
}

func DefaultIBSStrategy() Strategy {
	return Strategy{
		ID:          "ibs-mean-reversion",
		Name:        "IBS Mean Reversion",
		Description: "IBS",
		Type:        "ibs-mean-reversion",
		Parameters:  StrategyParameters{LowIBS: 0.1, HighIBS: 0.75, MaxHoldDays: 30},
		EntryConditions: []Condition{{Type: "indicator", Indicator: "IBS", Operator: "<", Value: 0.1}},
		ExitConditions:  []Condition{{Type: "indicator", Indicator: "IBS", Operator: ">", Value: 0.75}},
		RiskManagement: RiskManagement{
			InitialCapital: 10000,
			CapitalUsage:   100,
			Leverage:       1,
			MaxPositionSize: 1,
			StopLoss:       2,
			TakeProfit:     4,
			MaxPositions:   1,
			MaxHoldDays:    30,
			Commission:     Commission{Type: "percentage", Percentage: 0},
		},
		PositionSizing: PositionSizing{Type: "percentage", Value: 100},
	}
}
