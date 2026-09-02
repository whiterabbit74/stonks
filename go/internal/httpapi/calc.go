package httpapi

import (
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
	s.mux.HandleFunc("POST /api/calc/clean-backtest", wrap(s.calcClean))
	s.mux.HandleFunc("POST /api/calc/backtest", wrap(s.calcClean))
	s.mux.HandleFunc("POST /api/calc/single-position", wrap(s.calcSingle))
	s.mux.HandleFunc("POST /api/calc/options", wrap(s.calcOptions))
	s.mux.HandleFunc("POST /api/calc/options-multi", wrap(s.calcOptionsMulti))
	s.mux.HandleFunc("POST /api/calc/ema-zone", wrap(s.calcEMA))
	s.mux.HandleFunc("POST /api/calc/buy-at-close", wrap(s.calcBuyAtClose))
	s.mux.HandleFunc("POST /api/calc/buy-at-close-4", wrap(s.calcBAC4))
	s.mux.HandleFunc("POST /api/calc/no-stop-loss", wrap(s.calcNoStop))
	s.mux.HandleFunc("POST /api/calc/metrics", wrap(s.calcMetrics))
	s.mux.HandleFunc("POST /api/calc/indicators", wrap(s.calcIndicators))
	s.mux.HandleFunc("POST /api/calc/black-scholes", wrap(s.calcBS))
	s.mux.HandleFunc("POST /api/calc/split-adjust", wrap(s.calcSplits))
	s.mux.HandleFunc("POST /api/calc/margin", wrap(s.calcMargin))
	s.mux.HandleFunc("POST /api/calc/ibs-signals", wrap(s.calcIBS))
	s.mux.HandleFunc("POST /api/calc/buy-hold", wrap(s.calcBuyHold))
}

type calcReq struct {
	Data     any    `json:"data"`
	Strategy any    `json:"strategy"`
	Ticker   string `json:"ticker"`
	Tickers  []struct {
		Ticker string `json:"ticker"`
		Data   any    `json:"data"`
	} `json:"tickers"`
	Options        *backtest.CleanOptions    `json:"options"`
	Leverage       float64                   `json:"leverage"`
	Config         backtest.OptionsConfig    `json:"config"`
	Trades         any                       `json:"trades"`
	Ema            backtest.EmaParams        `json:"ema"`
	NoStop         backtest.NoStopLossConfig `json:"noStop"`
	Single         backtest.SingleOptions    `json:"single"`
	Splits         []types.SplitEvent        `json:"splits"`
	InitialCapital float64                   `json:"initialCapital"`
}

func (s *Server) calcClean(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	bars := s.barsOrDataset(req)
	st := decodeStrategy(req.Strategy)
	writeJSON(w, 200, backtest.RunClean(bars, st, req.Options))
}

func (s *Server) calcBuyAtClose(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	writeJSON(w, 200, backtest.RunBuyAtClose(s.barsOrDataset(req), decodeStrategy(req.Strategy)))
}

func (s *Server) calcNoStop(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	writeJSON(w, 200, backtest.RunNoStopLoss(s.barsOrDataset(req), decodeStrategy(req.Strategy), req.NoStop))
}

func (s *Server) calcSingle(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	tickers := s.tickersOrOne(req)
	eq, final, maxDD, trades, m, exp := backtest.RunSinglePosition(tickers, decodeStrategy(req.Strategy), req.Leverage, req.Single)
	writeJSON(w, 200, map[string]any{"equity": eq, "finalValue": final, "maxDrawdown": maxDD, "trades": trades, "metrics": m, "exposure": exp})
}

func (s *Server) calcOptions(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	eq, trades, final := backtest.RunOptions(decodeTrades(req.Trades), s.barsOrDataset(req), req.Config)
	writeJSON(w, 200, map[string]any{"equity": eq, "trades": trades, "finalValue": final})
}

func (s *Server) calcOptionsMulti(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	eq, trades, final := backtest.RunMultiOptions(decodeTrades(req.Trades), s.tickersOrOne(req), req.Config)
	writeJSON(w, 200, map[string]any{"equity": eq, "trades": trades, "finalValue": final})
}

func (s *Server) calcEMA(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	writeJSON(w, 200, backtest.RunEmaZone(s.tickersOrOne(req), req.Ema))
}

func (s *Server) calcBAC4(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	writeJSON(w, 200, backtest.RunBuyAtClose4(s.tickersOrOne(req), decodeStrategy(req.Strategy), req.Leverage))
}

func (s *Server) calcMetrics(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Trades         []types.Trade       `json:"trades"`
		Equity         []types.EquityPoint `json:"equity"`
		InitialCapital float64             `json:"initialCapital"`
	}
	_ = readJSON(r, &req)
	if req.InitialCapital == 0 {
		req.InitialCapital = 10000
	}
	writeJSON(w, 200, metrics.New(req.Trades, req.Equity, req.InitialCapital, nil).All())
}

func (s *Server) calcIndicators(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	bars := s.barsOrDataset(req)
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
	_ = readJSON(r, &req)
	if req.Type == "" {
		req.Type = "call"
	}
	writeJSON(w, 200, map[string]any{"price": optionsmath.BlackScholes(req.Type, req.S, req.K, req.T, req.R, req.Sigma)})
}

func (s *Server) calcSplits(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	bars := s.barsOrDataset(req)
	writeJSON(w, 200, map[string]any{
		"adjusted": splits.AdjustOHLC(bars, req.Splits),
		"detected": splits.Detect(bars),
		"holder":   splits.ApplyHolderValue(bars, req.Splits),
	})
}

func (s *Server) calcMargin(w http.ResponseWriter, r *http.Request) {
	var req backtest.MarginParams
	_ = readJSON(r, &req)
	writeJSON(w, 200, backtest.SimulateMargin(req))
}

func (s *Server) calcIBS(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IBS    any `json:"ibs"`
		LowIBS any `json:"lowIBS"`
		HighIBS any `json:"highIBS"`
	}
	_ = readJSON(r, &req)
	writeJSON(w, 200, map[string]any{
		"entry": ibs.IsEntrySignal(req.IBS, req.LowIBS),
		"exit":  ibs.IsExitSignal(req.IBS, req.HighIBS),
	})
}

func (s *Server) calcBuyHold(w http.ResponseWriter, r *http.Request) {
	var req calcReq
	_ = readJSON(r, &req)
	cap := req.InitialCapital
	if cap == 0 {
		cap = 10000
	}
	writeJSON(w, 200, backtest.RunBuyHold(s.barsOrDataset(req), cap))
}

func (s *Server) barsOrDataset(req calcReq) []types.OHLC {
	if req.Data != nil {
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

func (s *Server) tickersOrOne(req calcReq) []backtest.TickerIndexed {
	var out []backtest.TickerIndexed
	if len(req.Tickers) > 0 {
		for _, t := range req.Tickers {
			bars := decodeBars(t.Data)
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
