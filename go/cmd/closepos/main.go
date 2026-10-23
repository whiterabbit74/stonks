// closepos закрывает строку журнала тем же store.ClosePosition, которым её
// закрывает UI: та же транзакция, тот же расчёт PnL, то же обнуление ног и тот
// же запрет повторного закрытия.
//
// Нужен там, где HTTP API недоступен: на проде ADMIN_PASSWORD — bcrypt-хеш, и
// без плейнтекста пароля журнал нечем починить, кроме браузера. Запускается
// рядом с живым сервером (SQLite в WAL, busy_timeout 5 с):
//
//	docker cp closepos stonks-server:/tmp/closepos
//	docker exec -u app stonks-server /tmp/closepos -dry -id <id> -symbol MSFT \
//	    -date 2026-10-23 -price 524.7 -ibs 78.4
//
// Сначала -dry: он печатает строку и проверки, не записывая ничего. Тикер и
// статус обязательны в аргументах — страховка от закрытия чужой строки.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"mktorder.com/go/internal/store"
)

func main() {
	dbPath := flag.String("db", "/data/db/trading.db", "путь к trading.db")
	id := flag.String("id", "", "id позиции")
	symbol := flag.String("symbol", "", "ожидаемый тикер (страховка от закрытия чужой строки)")
	date := flag.String("date", "", "дата выхода YYYY-MM-DD")
	price := flag.Float64("price", 0, "цена выхода (цена решения T-1)")
	ibsPct := flag.Float64("ibs", -1, "IBS выхода в процентах")
	notes := flag.String("notes", "", "notes")
	dry := flag.Bool("dry", false, "только показать строку, ничего не писать")
	flag.Parse()

	if *id == "" || *symbol == "" || *date == "" || !(*price > 0) {
		fmt.Fprintln(os.Stderr, "нужны -id -symbol -date -price")
		os.Exit(2)
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "open:", err)
		os.Exit(1)
	}
	defer db.Close()

	rows, err := db.ListPositions()
	if err != nil {
		fmt.Fprintln(os.Stderr, "list:", err)
		os.Exit(1)
	}
	var found *store.Position
	for i := range rows {
		if rows[i].ID == *id {
			found = &rows[i]
			break
		}
	}
	if found == nil {
		fmt.Fprintln(os.Stderr, "позиция не найдена:", *id)
		os.Exit(1)
	}
	if found.Symbol != *symbol || found.Status != "open" {
		fmt.Fprintf(os.Stderr, "отказ: строка %s это %s/%s, ожидалось %s/open\n", *id, found.Symbol, found.Status, *symbol)
		os.Exit(1)
	}
	before, _ := json.Marshal(found)
	fmt.Println("BEFORE", string(before))

	if *dry {
		fmt.Println("DRY: строка найдена и проходит проверки, ничего не записано")
		return
	}

	exit := store.PositionExit{Date: *date, Price: *price, Notes: *notes}
	if *ibsPct >= 0 {
		v := *ibsPct / 100
		exit.IBS = &v
	}
	updated, err := db.ClosePosition(*id, exit)
	if err != nil {
		fmt.Fprintln(os.Stderr, "close:", err)
		os.Exit(1)
	}
	after, _ := json.Marshal(updated)
	fmt.Println("AFTER", string(after))
}
