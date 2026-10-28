package httpapi

import (
	"sync"
	"testing"
)

// AUD-193: завершение OAuth Robinhood не переписывает общий клиент котировок.
// Котировки и история читают Providers.Robinhood без замка, поэтому запись
// в обработчике была гонкой данных. Ловится под go test -race.
func TestAUD193AttachRobinhoodDoesNotRaceQuoteReads(t *testing.T) {
	s := testServer(t, "")
	before := s.Providers.Robinhood
	if before == nil {
		t.Fatal("клиент Robinhood для котировок должен создаваться при старте")
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			s.attachRobinhood()
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			_, _ = s.Providers.Quote("AAPL", "robinhood") // не подключён: ошибка без сети
		}
	}()
	wg.Wait()
	if s.Providers.Robinhood != before {
		t.Fatal("подключение заменило клиент котировок Robinhood")
	}
	if s.Live.BrokerNamed("robinhood") == nil {
		t.Fatal("после подключения брокер Robinhood должен быть в движке")
	}
}
