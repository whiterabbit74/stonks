package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func postCalc(t *testing.T, s *Server, kind string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/calc/"+kind, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s %d %s", kind, rec.Code, rec.Body.String())
	}
	return rec
}

func decodeCalc(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func tradeSlice(t *testing.T, rec *httptest.ResponseRecorder) []types.Trade {
	t.Helper()
	var wrap struct {
		Trades []types.Trade `json:"trades"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &wrap); err != nil {
		t.Fatalf("%v body=%s", err, rec.Body.String())
	}
	return wrap.Trades
}

func TestUICalcKindsMatchGoldens(t *testing.T) {
	s := testServer(t, "")
	bars := goldens.Bars("googl-bars.json")
	st := types.DefaultIBSStrategy()
	tickers := []map[string]any{{"ticker": "GOOGL", "data": bars}}

	t.Run("single-position", func(t *testing.T) {
		rec := postCalc(t, s, "single-position", map[string]any{
			"tickers": tickers, "strategy": st, "leverage": 1,
		})
		got := tradeSlice(t, rec)
		want := goldens.CompactTrades("googl-single-position-trades.json")
		if len(got) != len(want) {
			t.Fatalf("trades %d want %d", len(got), len(want))
		}
		if got[0].EntryDate != want[0].EntryDate || got[0].ExitDate != want[0].ExitDate {
			t.Fatalf("first %s->%s want %s->%s", got[0].EntryDate, got[0].ExitDate, want[0].EntryDate, want[0].ExitDate)
		}
		if !goldens.MustAlmost(got[0].EntryPrice, want[0].EntryPrice, 1e-12) || !goldens.MustAlmost(got[0].PnL, want[0].PnL, 1e-9) {
			t.Fatalf("first prices/pnl %+v want %+v", got[0], want[0])
		}
		body := decodeCalc(t, rec)
		if body["equity"] == nil {
			t.Fatal("missing equity")
		}
	})

	t.Run("buy-at-close", func(t *testing.T) {
		rec := postCalc(t, s, "buy-at-close", map[string]any{"data": bars, "strategy": st})
		got := tradeSlice(t, rec)
		want := goldens.CompactTrades("googl-buy-at-close-trades.json")
		if len(got) != len(want) {
			t.Fatalf("trades %d want %d", len(got), len(want))
		}
		if got[0].EntryDate != want[0].EntryDate || got[len(got)-1].ExitDate != want[len(want)-1].ExitDate {
			t.Fatalf("date span mismatch")
		}
	})

	t.Run("buy-at-close-4", func(t *testing.T) {
		rec := postCalc(t, s, "buy-at-close-4", map[string]any{
			"tickers": tickers, "strategy": st, "leverage": 1,
		})
		got := tradeSlice(t, rec)
		var wantFinal struct {
			FinalValue float64 `json:"finalValue"`
			TradeCount int     `json:"tradeCount"`
		}
		goldens.Load("googl-bac4-final.json", &wantFinal)
		if len(got) != wantFinal.TradeCount {
			t.Fatalf("trades %d want %d", len(got), wantFinal.TradeCount)
		}
		body := decodeCalc(t, rec)
		if !goldens.MustAlmost(body["finalValue"].(float64), wantFinal.FinalValue, 1e-9) {
			t.Fatalf("final %v want %v", body["finalValue"], wantFinal.FinalValue)
		}
	})

	t.Run("no-stop-loss", func(t *testing.T) {
		rec := postCalc(t, s, "no-stop-loss", map[string]any{
			"data": bars, "strategy": st,
			"noStop": map[string]any{"exitMode": "never"},
		})
		got := tradeSlice(t, rec)
		want := goldens.CompactTrades("googl-nostoploss-never-trades.json")
		if len(got) != len(want) {
			t.Fatalf("never trades %d want %d", len(got), len(want))
		}
		rec = postCalc(t, s, "no-stop-loss", map[string]any{
			"data": bars, "strategy": st,
			"noStop": map[string]any{"exitMode": "ibs-only", "requireProfitableExit": true},
		})
		got = tradeSlice(t, rec)
		want = goldens.CompactTrades("googl-nostoploss-ibs-profit-trades.json")
		if len(got) != len(want) {
			t.Fatalf("ibs-only trades %d want %d", len(got), len(want))
		}
	})

	t.Run("ema-zone", func(t *testing.T) {
		rec := postCalc(t, s, "ema-zone", map[string]any{
			"tickers": tickers,
			"ema": map[string]any{
				"initialCapital": 10000, "leverage": 1, "emaPeriod": 200,
				"buyZones":     []map[string]any{{"id": "buy-20", "levelPct": -20, "enabled": true}},
				"sellZones":    []map[string]any{{"id": "sell-40", "levelPct": 40, "enabled": true}},
				"signalSource": "close", "emaStartMode": "full_history",
			},
		})
		got := tradeSlice(t, rec)
		var want struct {
			FinalValue  float64 `json:"finalValue"`
			TradeCount  int     `json:"tradeCount"`
			MaxDrawdown float64 `json:"maxDrawdown"`
		}
		goldens.Load("googl-ema-final.json", &want)
		if len(got) != want.TradeCount {
			t.Fatalf("ema trades %d want %d", len(got), want.TradeCount)
		}
		body := decodeCalc(t, rec)
		if !goldens.MustAlmost(body["finalValue"].(float64), want.FinalValue, 1e-9) {
			t.Fatalf("ema final %v want %v", body["finalValue"], want.FinalValue)
		}
		if body["equity"] == nil || body["deviation"] == nil {
			t.Fatal("ema missing equity/deviation")
		}
	})

	t.Run("options-multi", func(t *testing.T) {
		stock := postCalc(t, s, "single-position", map[string]any{
			"tickers": tickers, "strategy": st, "leverage": 1,
		})
		stockTrades := tradeSlice(t, stock)
		rec := postCalc(t, s, "options-multi", map[string]any{
			"tickers": tickers,
			"trades":  stockTrades,
			"config":  map[string]any{"strikePct": 10, "volAdjPct": 20, "capitalPct": 10, "expirationWeeks": 4, "maxHoldingDays": 30},
		})
		got := tradeSlice(t, rec)
		var wantFinal struct {
			FinalValue float64 `json:"finalValue"`
			TradeCount int     `json:"tradeCount"`
		}
		goldens.Load("googl-options-multi-final.json", &wantFinal)
		if len(got) != wantFinal.TradeCount {
			t.Fatalf("options-multi trades %d want %d", len(got), wantFinal.TradeCount)
		}
		body := decodeCalc(t, rec)
		if !goldens.MustAlmost(body["finalValue"].(float64), wantFinal.FinalValue, 1e-9) {
			t.Fatalf("options-multi final %v want %v", body["finalValue"], wantFinal.FinalValue)
		}
	})

	t.Run("buy-hold", func(t *testing.T) {
		rec := postCalc(t, s, "buy-hold", map[string]any{"data": bars, "initialCapital": 10000})
		got := tradeSlice(t, rec)
		if len(got) != 1 {
			t.Fatalf("buy-hold trades %d", len(got))
		}
		if got[0].EntryDate != bars[0].Date || got[0].ExitDate != bars[len(bars)-1].Date {
			t.Fatalf("buy-hold dates %s->%s", got[0].EntryDate, got[0].ExitDate)
		}
		if got[0].EntryPrice != bars[0].Close || got[0].ExitPrice != bars[len(bars)-1].Close {
			t.Fatalf("buy-hold prices %v/%v", got[0].EntryPrice, got[0].ExitPrice)
		}
	})

	t.Run("metrics", func(t *testing.T) {
		clean := postCalc(t, s, "clean-backtest", map[string]any{"data": bars, "strategy": st})
		var result types.BacktestResult
		if err := json.Unmarshal(clean.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		rec := postCalc(t, s, "metrics", map[string]any{
			"trades": result.Trades, "equity": result.Equity, "initialCapital": 10000,
		})
		var m types.PerformanceMetrics
		if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
			t.Fatal(err)
		}
		var wantM types.PerformanceMetrics
		goldens.Load("googl-metrics-calculator.json", &wantM)
		if m.TotalTrades != wantM.TotalTrades {
			t.Fatalf("metrics trades %d want %d", m.TotalTrades, wantM.TotalTrades)
		}
		if !goldens.MustAlmost(m.TotalReturn, wantM.TotalReturn, 1e-9) {
			t.Fatalf("totalReturn %v want %v", m.TotalReturn, wantM.TotalReturn)
		}
	})
}

func uiStrategyPayload() map[string]any {
	return map[string]any{
		"id": "ibs-mean-reversion", "type": "ibs-mean-reversion", "name": "IBS",
		"parameters": map[string]any{"lowIBS": 0.1, "highIBS": 0.75, "maxHoldDays": 30},
		"riskManagement": map[string]any{
			"initialCapital": 10000, "capitalUsage": 100, "slippage": 0, "maxHoldDays": 30,
			"commission": map[string]any{"type": "percentage", "percentage": 0, "fixed": 0},
		},
	}
}

func TestSingleTakeProfitJSONFromUI(t *testing.T) {
	s := testServer(t, "")
	data := []types.OHLC{
		{Date: "2024-01-01", Open: 101, High: 112, Low: 99, Close: 100, Volume: 1000},
		{Date: "2024-01-02", Open: 100, High: 103, Low: 98, Close: 98.2, Volume: 1000},
		{Date: "2024-01-03", Open: 99, High: 101, Low: 98, Close: 99, Volume: 1000},
	}
	rec := postCalc(t, s, "single-position", map[string]any{
		"tickers":  []map[string]any{{"ticker": "AAPL", "data": data}},
		"strategy": uiStrategyPayload(),
		"leverage": 1,
		"single":   map[string]any{"allowSameDayReentry": true, "takeProfitPercent": 2},
	})
	got := tradeSlice(t, rec)
	want := goldens.CompactTrades("single-position-takeprofit.json")
	if len(got) != len(want) {
		t.Fatalf("tp trades %d want %d (JSON takeProfitPercent not applied?)", len(got), len(want))
	}
	for i := range want {
		if got[i].ExitReason != want[i].ExitReason || got[i].EntryDate != want[i].EntryDate {
			t.Fatalf("[%d] %s %s want %s %s", i, got[i].EntryDate, got[i].ExitReason, want[i].EntryDate, want[i].ExitReason)
		}
		if !goldens.MustAlmost(got[i].ExitPrice, want[i].ExitPrice, 1e-9) {
			t.Fatalf("[%d] exit %v want %v", i, got[i].ExitPrice, want[i].ExitPrice)
		}
	}
}

func TestMonthlyContributionJSONFromUI(t *testing.T) {
	s := testServer(t, "")
	data := []types.OHLC{
		{Date: "2024-01-02", Open: 100, High: 101, Low: 90, Close: 91, Volume: 1000},
		{Date: "2024-01-03", Open: 91, High: 95, Low: 90, Close: 94, Volume: 1000},
		{Date: "2024-02-01", Open: 94, High: 96, Low: 80, Close: 81, Volume: 1000},
		{Date: "2024-02-02", Open: 81, High: 90, Low: 80, Close: 88, Volume: 1000},
	}
	rec := postCalc(t, s, "single-position", map[string]any{
		"tickers":  []map[string]any{{"ticker": "AAPL", "data": data}},
		"strategy": types.DefaultIBSStrategy(),
		"leverage": 1,
		"single":   map[string]any{"monthlyAmount": 500, "monthlyDayOfMonth": 1},
	})
	body := decodeCalc(t, rec)
	metrics, _ := body["metrics"].(map[string]any)
	if metrics == nil {
		t.Fatal("missing metrics")
	}
	if metrics["contributionCount"].(float64) < 1 {
		t.Fatalf("monthlyAmount JSON not applied: %+v", metrics)
	}
}

func TestIBSSignalsHTTPMatchesOracle(t *testing.T) {
	s := testServer(t, "")
	var g struct {
		Cases []struct {
			Fn        string `json:"fn"`
			IBS       any    `json:"ibs"`
			Threshold any    `json:"threshold"`
			Result    bool   `json:"result"`
		} `json:"cases"`
	}
	goldens.Load("ibs-signals.json", &g)
	for i, c := range g.Cases {
		payload := map[string]any{"ibs": c.IBS, "lowIBS": c.Threshold, "highIBS": c.Threshold}
		rec := postCalc(t, s, "ibs-signals", payload)
		var body struct {
			Entry bool `json:"entry"`
			Exit  bool `json:"exit"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		got := body.Entry
		if c.Fn == "exit" {
			got = body.Exit
		}
		if got != c.Result {
			t.Errorf("case %d %s ibs=%v thr=%v got %v want %v", i, c.Fn, c.IBS, c.Threshold, got, c.Result)
		}
	}
}

func TestDecodeStrategyKeepsExplicitZeros(t *testing.T) {
	raw := json.RawMessage(`{"parameters":{"lowIBS":0,"highIBS":0,"maxHoldDays":0},"riskManagement":{"capitalUsage":0,"initialCapital":0}}`)
	s := decodeStrategy(raw)
	if s.Parameters.LowIBS == nil || *s.Parameters.LowIBS != 0 {
		t.Fatalf("lowIBS %v", s.Parameters.LowIBS)
	}
	if s.Parameters.HighIBS == nil || *s.Parameters.HighIBS != 0 {
		t.Fatalf("highIBS %v", s.Parameters.HighIBS)
	}
	if s.Parameters.MaxHoldDays == nil || *s.Parameters.MaxHoldDays != 0 {
		t.Fatalf("maxHoldDays %v", s.Parameters.MaxHoldDays)
	}
	if s.RiskManagement.CapitalUsage == nil || *s.RiskManagement.CapitalUsage != 0 {
		t.Fatalf("capitalUsage %v", s.RiskManagement.CapitalUsage)
	}
	if s.RiskManagement.InitialCapital == nil || *s.RiskManagement.InitialCapital != 0 {
		t.Fatalf("initialCapital %v", s.RiskManagement.InitialCapital)
	}
}

func TestDecodeStrategyOmitsStayUnset(t *testing.T) {
	s := decodeStrategy(json.RawMessage(`{}`))
	if s.Parameters.LowIBS != nil || s.Parameters.HighIBS != nil || s.Parameters.MaxHoldDays != nil {
		t.Fatalf("omitted parameters should be nil: %+v", s.Parameters)
	}
	if s.RiskManagement.CapitalUsage != nil || s.RiskManagement.InitialCapital != nil {
		t.Fatalf("omitted risk fields should be nil: %+v", s.RiskManagement)
	}
}

func TestCalcEmptyDataReturns400(t *testing.T) {
	s := testServer(t, "")
	kinds := []string{"indicators", "single-position", "ema-zone", "buy-at-close-4", "options-multi"}
	for _, kind := range kinds {
		body, _ := json.Marshal(map[string]any{})
		req := httptest.NewRequest("POST", "/api/calc/"+kind, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s got %d %s", kind, rec.Code, rec.Body.String())
		}
	}
	body, _ := json.Marshal(map[string]any{
		"tickers": []map[string]any{{"ticker": "AAPL", "data": []any{}}},
	})
	req := httptest.NewRequest("POST", "/api/calc/single-position", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty ticker bars got %d %s", rec.Code, rec.Body.String())
	}
}
