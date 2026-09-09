package live

import (
	"strings"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-085: прогон, где один брокер выходит, а другой входит, схлопывался в
// одно направление: строки всех брокеров печатались с направлением и тикером
// общей шапки, и покупка NVDA у Robinhood уезжала как «SELL … отправлен» под
// заголовком «Закрываем AAPL».
func TestT1TextKeepsEachBrokerOwnSideAndSymbol(t *testing.T) {
	db, err := store.Open(t.TempDir() + "/t.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	res := EvalResult{
		Decision: map[string]any{"action": "none", "reason": "no_signal"},
		Quotes: []LiveQuote{
			{Symbol: "AAPL", CurrentPrice: 11.9},
			{Symbol: "NVDA", CurrentPrice: 8.2},
		},
		Broker: map[string]any{
			"webull":    map[string]any{"submitted": true, "quantity": 7.0},
			"robinhood": map[string]any{"submitted": true, "quantity": 5.0},
		},
		BrokerDecisions: map[string]map[string]any{
			"webull":    {"action": "exit", "symbol": "AAPL", "candidate": &LiveQuote{IBS: 0.97}},
			"robinhood": {"action": "entry", "symbol": "NVDA", "candidate": &LiveQuote{IBS: 0.03}},
		},
	}
	text := e.buildT1Text(1, nil, nil, false, false, res, EvalResult{}, nil)
	if !strings.Contains(text, "Webull: SELL AAPL MARKET отправлен") {
		t.Fatalf("the exit must keep its own side and ticker:\n%s", text)
	}
	if !strings.Contains(text, "Robinhood: BUY NVDA MARKET отправлен") {
		t.Fatalf("the entry must not be reported as the other broker's exit:\n%s", text)
	}
}
