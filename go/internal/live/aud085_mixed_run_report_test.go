package live

import (
	"strings"
	"testing"
)

// AUD-085: прогон, где у брокера и продажи, и покупка, схлопывался в одно
// направление: строки печатались с направлением и тикером общей шапки, и
// покупка уезжала как «SELL … отправлен». Каждая заявка в отчёте говорит за
// себя: своё направление, свой тикер, свой брокер.
func TestT1TextKeepsEachOrderOwnSideAndSymbol(t *testing.T) {
	res := EvalResult{
		AutoTrading: map[string]any{"enabled": true},
		Monitor: &MonitorStep{
			Exit:  &LiveQuote{Symbol: "AAPL", IBS: 0.97, CurrentPrice: 11.9},
			Entry: &LiveQuote{Symbol: "NVDA", IBS: 0.03, CurrentPrice: 8.2},
		},
		Runs: map[string]*BrokerRun{
			"webull": {
				Sells: []OrderResult{
					{Submitted: true, Quantity: 7, Symbol: "AAPL", Side: "SELL"},
					{Submitted: true, Quantity: 10, Symbol: "TQQQ", Side: "SELL"},
				},
				Buy: &OrderResult{Submitted: true, Quantity: 5, Symbol: "NVDA", Side: "BUY"},
			},
			"robinhood": {Reason: "broker_not_flat", Symbols: []string{"TQQQ"}},
		},
	}
	text := t1AutoText(res, false)
	for _, want := range []string{
		"Webull: SELL AAPL MARKET отправлен (7 шт.)",
		"Webull: SELL TQQQ MARKET отправлен (10 шт.)",
		"Webull: BUY NVDA MARKET отправлен (5 шт.)",
		"Robinhood: вход NVDA пропущен — на счёте остаток: TQQQ",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("want %q in:\n%s", want, text)
		}
	}
}
