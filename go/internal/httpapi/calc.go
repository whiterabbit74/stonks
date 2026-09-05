package httpapi

import (
	"encoding/json"
	"net/http"

	"mktorder.com/go/internal/backtest"
	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/optionsmath"
	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/types"
)

func (s *Server) registerCalc() {
	wrap := func(fn http.HandlerFunc) http.HandlerFunc { return s.auth(fn) }
	for path, fn := range map[string]http.HandlerFunc{
		"POST /api/calc/clean-backtest":  s.calcClean,
		"POST /api/calc/backtest":        s.calcClean,
		"POST /api/calc/single-position": s.calcSingle,
		"POST /api/calc/options":         s.calcOptions,
		"POST /api/calc/options-multi":   s.calcOptionsMulti,
		"POST /api/calc/ema-zone":        s.calcEMA,
		"POST /api/calc/buy-at-close":    s.calcBuyAtClose,
		"POST /api/calc/buy-at-close-4":  s.calcBAC4,
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
	writeJSON(w, 200, backtest.RunClean(s.barsOrDataset(req), decodeStrategy(req.Strategy), req.Options))
}

func (s *Server) calcBuyAtClose(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	writeJSON(w, 200, backtest.RunBuyAtClose(s.barsOrDataset(req), decodeStrategy(req.Strategy)))
}

func (s *Server) calcNoStop(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	writeJSON(w, 200, backtest.RunNoStopLoss(s.barsOrDataset(req), decodeStrategy(req.Strategy), req.NoStop))
}

func (s *Server) calcSingle(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers := s.tickersOrOne(req)
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

func (s *Server) calcOptions(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	eq, trades, final := backtest.RunOptions(decodeTrades(req.Trades), s.barsOrDataset(req), req.Config)
	m := metrics.New(trades, eq, 10000, nil).All()
	writeJSON(w, 200, map[string]any{"equity": eq, "trades": trades, "finalValue": final, "metrics": m, "maxDrawdown": m.MaxDrawdown})
}

func (s *Server) calcOptionsMulti(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers := s.tickersOrOne(req)
	if !tickerDataPresent(tickers) {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	eq, trades, final := backtest.RunMultiOptions(decodeTrades(req.Trades), tickers, req.Config)
	m := metrics.New(trades, eq, 10000, nil).All()
	writeJSON(w, 200, map[string]any{"equity": eq, "trades": trades, "finalValue": final, "metrics": m, "maxDrawdown": m.MaxDrawdown})
}

func (s *Server) calcEMA(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers := s.tickersOrOne(req)
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

func (s *Server) calcBAC4(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	tickers := s.tickersOrOne(req)
	if !tickerDataPresent(tickers) {
		writeJSON(w, 400, map[string]any{"error": "data is required"})
		return
	}
	writeJSON(w, 200, backtest.RunBuyAtClose4(tickers, decodeStrategy(req.Strategy), types.F64Or(req.Leverage, 1)))
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
	bars := s.barsOrDataset(req)
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
	writeJSON(w, 200, map[string]any{"price": optionsmath.BlackScholes(req.Type, req.S, req.K, req.T, req.R, req.Sigma)})
}

func (s *Server) calcSplits(w http.ResponseWriter, r *http.Request) {
	req, ok := s.readCalc(w, r)
	if !ok {
		return
	}
	bars := s.barsOrDataset(req)
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
	res := backtest.RunBuyHold(s.barsOrDataset(req), cap)
	final := 0.0
	if len(res.Equity) > 0 {
		final = res.Equity[len(res.Equity)-1].Value
	}
	writeJSON(w, 200, map[string]any{
		"trades": res.Trades, "equity": res.Equity, "metrics": res.Metrics,
		"finalValue": final, "maxDrawdown": res.Metrics.MaxDrawdown,
	})
}

func (s *Server) barsOrDataset(req calcReq) []types.OHLC {
	if len(req.Data) > 0 {
		return decodeBars(req.Data)
	}
	if req.Ticker != "" {
		ds, _ := s.DB.GetDataset(req.Ticker)
		if ds != nil {
			return decodeBars(ds["data"])
		}
	}
	return nil
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

func (s *Server) barsForSymbol(symbol string) []types.OHLC {
	if symbol == "" || s.DB == nil {
		return nil
	}
	bars, _, err := s.DB.GetOHLC(symbol)
	if err != nil || len(bars) == 0 {
		return nil
	}
	return normalizeBarDates(bars)
}

func (s *Server) tickersOrOne(req calcReq) []backtest.TickerIndexed {
	var out []backtest.TickerIndexed
	if len(req.Tickers) > 0 {
		for _, t := range req.Tickers {
			bars := decodeBars(t.Data)
			if len(bars) == 0 {
				bars = s.barsForSymbol(t.Ticker)
			}
			if len(bars) == 0 {
				continue
			}
			out = append(out, backtest.TickerIndexed{Ticker: t.Ticker, Data: bars, IBSValues: indicators.IBS(bars)})
		}
		return out
	}
	bars := s.barsOrDataset(req)
	if len(bars) == 0 {
		return nil
	}
	sym := req.Ticker
	if sym == "" {
		sym = "TICKER"
	}
	return []backtest.TickerIndexed{{Ticker: sym, Data: bars, IBSValues: indicators.IBS(bars)}}
}
