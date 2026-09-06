package httpapi

import (
	"encoding/json"
	"math"
	"net/http"

	"mktorder.com/go/internal/backtest"
	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/optionsmath"
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/types"
)

func invalidCalcNumber(v float64) bool {
	return math.IsNaN(v) || math.IsInf(v, 0)
}

func (s *Server) registerCalc() {
	wrap := func(fn http.HandlerFunc) http.HandlerFunc { return s.auth(fn) }
	for path, fn := range map[string]http.HandlerFunc{
		"POST /api/calc/clean-backtest":  s.calcClean,
		"POST /api/calc/backtest":        s.calcClean,
		"POST /api/calc/single-position": s.calcSingle,
		"POST /api/calc/options-multi":   s.calcOptionsMulti,
		"POST /api/calc/ema-zone":        s.calcEMA,
		"POST /api/calc/no-stop-loss":    s.calcNoStop,
		"POST /api/calc/metrics":         s.calcMetrics,
		"POST /api/calc/indicators":      s.calcIndicators,
		"POST /api/calc/black-scholes":   s.calcBS,
		"POST /api/calc/split-adjust":    s.calcSplits,
		"POST /api/calc/margin":          s.calcMargin,
		"POST /api/calc/ibs-signals":     s.calcIBS,
		"POST /api/calc/buy-hold":        s.calcBuyHold,
	} {
		s.mux.HandleFunc(path, wrap(fn))
	}
}

type calcReq struct {
	Data     json.RawMessage `json:"data"`
	Strategy json.RawMessage `json:"strategy"`
	Ticker   string          `json:"ticker"`
	Tickers  []struct {
		Ticker string          `json:"ticker"`
		Data   json.RawMessage `json:"data"`
	} `json:"tickers"`
	Options         *backtest.CleanOptions    `json:"options"`
	Leverage        *float64                  `json:"leverage"`
	Config          backtest.OptionsConfig    `json:"config"`
	Trades          json.RawMessage           `json:"trades"`
	Ema             backtest.EmaParams        `json:"ema"`
	NoStop          backtest.NoStopLossConfig `json:"noStop"`
	Single          backtest.SingleOptions    `json:"single"`
	Splits          []types.SplitEvent        `json:"splits"`
	InitialCapital  *float64                  `json:"initialCapital"`
	IncludeBaseline bool                      `json:"includeBaseline"`
}

func (s *Server) readCalc(w http.ResponseWriter, r *http.Request) (calcReq, bool) {
	var req calcReq
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return req, false
	}
	return req, true
}

func (s *Server) calcClean(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	bars, ok := s.barsOrDataset(w, req)
	if !ok {
		return
	}
	opt := req.Options
	if opt == nil || len(opt.Splits) == 0 {
		events, ok := s.splitsFor(w, req.Ticker, req.Splits)
		if !ok {
			return
		}
		if len(events) > 0 {
			cp := backtest.CleanOptions{}
			if opt != nil {
				cp = *opt
			}
			cp.Splits = events
			opt = &cp
		}
	}
	res := backtest.RunClean(bars, decodeStrategy(req.Strategy), opt)
	writeJSON(w, 200, struct {
		types.BacktestResult
		CommissionApplied bool `json:"commissionApplied"`
	}{BacktestResult: res})
}

func (s *Server) calcNoStop(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	bars, ok := s.barsWithSplits(w, req)
	if !ok {
		return
	}
	writeJSON(w, 200, backtest.RunNoStopLoss(bars, decodeStrategy(req.Strategy), req.NoStop))
}

func (s *Server) calcSingle(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers, ok := s.tickersOrOne(w, req)
	if !ok {
		return
	}
	if !tickerDataPresent(tickers) {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	st := decodeStrategy(req.Strategy)
	lev := types.F64Or(req.Leverage, 1)
	eq, final, maxDD, trades, m, exp := backtest.RunSinglePosition(tickers, st, lev, req.Single)
	out := map[string]any{"equity": eq, "finalValue": final, "maxDrawdown": maxDD, "trades": trades, "metrics": m, "exposure": exp}
	if req.IncludeBaseline && lev != 1 {
		beq, bfinal, bmaxDD, btrades, bm, bexp := backtest.RunSinglePosition(tickers, st, 1, req.Single)
		out["baseline"] = map[string]any{"equity": beq, "finalValue": bfinal, "maxDrawdown": bmaxDD, "trades": btrades, "metrics": bm, "exposure": bexp}
	}
	writeJSON(w, 200, out)
}

func (s *Server) calcOptionsMulti(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers, ok := s.tickersOrOne(w, req)
	if !ok {
		return
	}
	if !tickerDataPresent(tickers) {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	cfg := req.Config
	if cfg.InitialCapital <= 0 {
		cfg.InitialCapital = types.F64Or(decodeStrategy(req.Strategy).RiskManagement.InitialCapital, 10000)
	}
	eq, trades, final := backtest.RunMultiOptions(decodeTrades(req.Trades), tickers, cfg)
	m := metrics.New(trades, eq, cfg.InitialCapital, nil).All()
	writeJSON(w, 200, map[string]any{"equity": eq, "trades": trades, "finalValue": final, "metrics": m, "maxDrawdown": m.MaxDrawdown})
}

func (s *Server) calcEMA(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers, ok := s.tickersOrOne(w, req)
	if !ok {
		return
	}
	if !tickerDataPresent(tickers) {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	res := backtest.RunEmaZone(tickers, req.Ema)
	if !req.IncludeBaseline || req.Ema.Leverage == 0 || req.Ema.Leverage == 1 {
		writeJSON(w, 200, res)
		return
	}
	baseP := req.Ema
	baseP.Leverage = 1
	base := backtest.RunEmaZone(tickers, baseP)
	writeJSON(w, 200, map[string]any{
		"equity": res.Equity, "exposure": res.Exposure, "finalValue": res.FinalValue,
		"maxDrawdown": res.MaxDrawdown, "trades": res.Trades, "metrics": res.Metrics,
		"deviation": res.Deviation, "baseline": base,
	})
}

func (s *Server) calcMetrics(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Trades         []types.Trade       `json:"trades"`
		Equity         []types.EquityPoint `json:"equity"`
		InitialCapital *float64            `json:"initialCapital"`
	}
	if !s.requireJSON(w, r, &req) {
		return
	}
	writeJSON(w, 200, metrics.New(req.Trades, req.Equity, types.F64Or(req.InitialCapital, 10000), nil).All())
}

func (s *Server) calcIndicators(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	bars, ok := s.barsWithSplits(w, req)
	if !ok {
		return
	}
	if len(bars) == 0 {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	closes := make([]float64, len(bars))
	for i, b := range bars {
		closes[i] = b.Close
	}
	sma, _ := indicators.SMA(closes, 20)
	ema, _ := indicators.EMA(closes, 20)
	writeJSON(w, 200, map[string]any{
		"ibs": indicators.IBS(bars), "sma20": sma, "ema20": ema, "rsi14": indicators.RSI(closes, 14),
	})
}

func (s *Server) calcBS(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type  string  `json:"type"`
		S     float64 `json:"S"`
		K     float64 `json:"K"`
		T     float64 `json:"T"`
		R     float64 `json:"r"`
		Sigma float64 `json:"sigma"`
	}
	if !s.requireJSON(w, r, &req) {
		return
	}
	if req.Type == "" {
		req.Type = "call"
	}
	if req.S <= 0 || req.K <= 0 || req.T < 0 || req.Sigma < 0 || invalidCalcNumber(req.S) || invalidCalcNumber(req.K) || invalidCalcNumber(req.T) || invalidCalcNumber(req.R) || invalidCalcNumber(req.Sigma) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid Black-Scholes parameters"})
		return
	}
	writeJSON(w, 200, map[string]any{"price": optionsmath.BlackScholes(req.Type, req.S, req.K, req.T, req.R, req.Sigma)})
}

func (s *Server) calcSplits(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	bars, ok := s.barsOrDataset(w, req)
	if !ok {
		return
	}
	writeJSON(w, 200, map[string]any{
		"adjusted": splits.AdjustOHLC(bars, req.Splits),
		"detected": splits.Detect(bars),
		"holder":   splits.ApplyHolderValue(bars, req.Splits),
	})
}

func (s *Server) calcMargin(w http.ResponseWriter, r *http.Request) {
	var req backtest.MarginParams
	if !s.requireJSON(w, r, &req) {
		return
	}
	if req.InitialCapital < 0 || req.Leverage <= 0 || invalidCalcNumber(req.InitialCapital) || invalidCalcNumber(req.Leverage) || (req.MaintenanceMarginPct != nil && (*req.MaintenanceMarginPct < 0 || invalidCalcNumber(*req.MaintenanceMarginPct))) || (req.CapitalUsagePct != nil && (*req.CapitalUsagePct < 0 || invalidCalcNumber(*req.CapitalUsagePct))) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid margin parameters"})
		return
	}
	writeJSON(w, 200, backtest.SimulateMargin(req))
}

func (s *Server) calcIBS(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IBS     any `json:"ibs"`
		LowIBS  any `json:"lowIBS"`
		HighIBS any `json:"highIBS"`
	}
	if !s.requireJSON(w, r, &req) {
		return
	}
	writeJSON(w, 200, map[string]any{
		"entry": ibs.IsEntrySignal(req.IBS, req.LowIBS),
		"exit":  ibs.IsExitSignal(req.IBS, req.HighIBS),
	})
}

func (s *Server) calcBuyHold(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	var cap float64
	if req.InitialCapital != nil {
		cap = *req.InitialCapital
	} else {
		cap = types.F64Or(decodeStrategy(req.Strategy).RiskManagement.InitialCapital, 10000)
	}
	bars, ok := s.barsWithSplits(w, req)
	if !ok {
		return
	}
	res := backtest.RunBuyHold(bars, cap)
	final := 0.0
	if len(res.Equity) > 0 {
		final = res.Equity[len(res.Equity)-1].Value
	}
	writeJSON(w, 200, map[string]any{
		"trades": res.Trades, "equity": res.Equity, "metrics": res.Metrics,
		"finalValue": final, "maxDrawdown": res.Metrics.MaxDrawdown,
	})
}

// datasetBars keeps the read error. A dataset that cannot be read is not a
// dataset without bars: answering 200 with a zero-trade backtest would present
// a storage failure as a strategy result.
func (s *Server) datasetBars(req calcReq) ([]types.OHLC, error) {
	if len(req.Data) > 0 {
		return decodeBars(req.Data), nil
	}
	if req.Ticker != "" {
		ds, err := s.DB.GetDataset(req.Ticker)
		if err != nil {
			return nil, err
		}
		if ds != nil {
			return decodeBars(ds["data"]), nil
		}
	}
	return nil, nil
}

// barsOrDataset answers the request itself when the dataset cannot be read;
// ok=false means the response is already written.
func (s *Server) barsOrDataset(w http.ResponseWriter, req calcReq) ([]types.OHLC, bool) {
	bars, err := s.datasetBars(req)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать датасет"})
		return nil, false
	}
	return bars, true
}

func (s *Server) barsWithSplits(w http.ResponseWriter, req calcReq) ([]types.OHLC, bool) {
	bars, ok := s.barsOrDataset(w, req)
	if !ok {
		return nil, false
	}
	events, ok := s.splitsFor(w, req.Ticker, req.Splits)
	if !ok {
		return nil, false
	}
	if len(events) > 0 {
		return splits.AdjustOHLC(bars, events), true
	}
	return bars, true
}

// pendingSplits is the stored split table that still applies to a symbol. A
// dataset already back-adjusted yields none — adjusting twice is as wrong as
// not adjusting at all. The error matters: an unreadable table looks exactly
// like "no splits", and the backtest would then run on raw prices in silence.
func (s *Server) pendingSplits(symbol string) ([]types.SplitEvent, error) {
	if symbol == "" || s.DB == nil {
		return nil, nil
	}
	// n=0 reads the adjusted flag without loading the history.
	_, adjusted, err := s.DB.GetOHLCLast(symbol, 0)
	if err != nil || adjusted {
		return nil, err
	}
	return s.DB.ListSplits(symbol)
}

// splitsFor picks the events a calculation must apply: what the request carries
// wins, otherwise the stored table. ok=false means the response is written.
func (s *Server) splitsFor(w http.ResponseWriter, symbol string, explicit []types.SplitEvent) ([]types.SplitEvent, bool) {
	if len(explicit) > 0 {
		return explicit, true
	}
	events, err := s.pendingSplits(symbol)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать сплиты"})
		return nil, false
	}
	return events, true
}

func tickerDataPresent(tickers []backtest.TickerIndexed) bool {
	if len(tickers) == 0 {
		return false
	}
	for _, t := range tickers {
		if len(t.Data) == 0 {
			return false
		}
	}
	return true
}

func (s *Server) barsForSymbol(symbol string) ([]types.OHLC, error) {
	if symbol == "" || s.DB == nil {
		return nil, nil
	}
	bars, _, err := s.DB.GetOHLC(symbol)
	if err != nil {
		return nil, err
	}
	if len(bars) == 0 {
		return nil, nil
	}
	return normalizeBarDates(bars), nil
}

func (s *Server) tickersOrOne(w http.ResponseWriter, req calcReq) ([]backtest.TickerIndexed, bool) {
	var out []backtest.TickerIndexed
	if len(req.Tickers) > 0 {
		for _, t := range req.Tickers {
			bars := decodeBars(t.Data)
			if len(bars) == 0 {
				stored, err := s.barsForSymbol(t.Ticker)
				if err != nil {
					writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать котировки"})
					return nil, false
				}
				bars = stored
			}
			if len(bars) == 0 {
				continue
			}
			events, ok := s.splitsFor(w, t.Ticker, req.Splits)
			if !ok {
				return nil, false
			}
			out = append(out, backtest.TickerIndexed{Ticker: t.Ticker, Data: bars, IBSValues: indicators.IBS(bars), Splits: events})
		}
		return out, true
	}
	bars, ok := s.barsOrDataset(w, req)
	if !ok {
		return nil, false
	}
	if len(bars) == 0 {
		return nil, true
	}
	events, ok := s.splitsFor(w, req.Ticker, req.Splits)
	if !ok {
		return nil, false
	}
	sym := req.Ticker
	if sym == "" {
		sym = "TICKER"
	}
	return []backtest.TickerIndexed{{Ticker: sym, Data: bars, IBSValues: indicators.IBS(bars), Splits: events}}, true
}
