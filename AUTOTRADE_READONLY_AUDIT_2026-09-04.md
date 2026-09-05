# Read-only аудит автоторговли — 2026-09-04

Исходный коммит: `433abfa`. Исходный рабочий каталог чистый. Проверяется текущий Go-код; прежние аудиты не считаются доказательством актуального дефекта. Меняется только этот отчёт, исходники не исправляются. Production, брокерские счета и отправка реальных заявок не используются.

Находки добавляются сразу после проверки, отдельным коммитом на каждую. P1 — высокий приоритет: ошибочная торговля, пропуск выхода или недостоверное управление торговлей. Уверенность относится к анализу кода, а не к факту инцидента на production.

Агенты Luna medium: `/root/orders` — отправка и брокеры; `/root/fills` — исполнения и журнал; `/root/scheduler` — расписание и восстановление. Итоговый статус всех: complete; ответы получены и проверены, активных поручений нет. Главный агент проверяет общие ограничения и подтверждает поступающие выводы.

## F01 — P1: отключение автоторговли возвращает успех при ошибке записи настроек

- **Уверенность: высокая.** `go/internal/live/autotrade.go:35-44` игнорирует ошибку `SaveSettings` и возвращает запрошенную конфигурацию; `go/internal/httpapi/server.go:1851-1857` безусловно отвечает HTTP 200 с `success: true`.
- **Сценарий:** в сохранённых настройках `enabled=true`; оператор отключает торговлю, но SQLite отказывает в записи (например, нет места либо запись запрещена). Чтение старых данных при этом продолжает работать. Интерфейс получает `enabled=false` и успех, хотя следующая `AutoConfig()` снова прочитает `enabled=true` (`autotrade.go:26-32`). Следующий запуск может отправлять заявки.
- **Основание:** `go/internal/store/db.go:883-887` возвращает реальную ошибку SQL-записи; она теряется только в вызывающем коде. Это не предположение о поведении брокера.
- **Критерий исправления:** ошибка сохранения доходит до HTTP-ответа; API не подтверждает отключение, пока оно не сохранено. Проверка: запретить UPDATE настроек в тестовой SQLite, запросить отключение и убедиться, что ответ сообщает ошибку, а не успех.

## F02 — P1: открытая позиция Robinhood теряет автоматический выход после удаления тикера из мониторинга

- **Уверенность: высокая.** `go/internal/live/autotrade.go:255-273` добавляет в список котировок удалённый из мониторинга тикер только для книги Webull (`booksFor("webull", ...)`). `go/internal/live/execute_all.go:60-62` затем использует один и тот же `ev.Quotes` для каждого брокера.
- **Сценарий:** Robinhood держит AAPL, в журнале есть открытая сделка Robinhood; Webull не держит AAPL. Оператор удаляет AAPL из мониторинга. `configuredSymbols` берёт тикеры только из мониторинга (`config.go:174-196`), котировка AAPL больше не запрашивается. При сигнале продажи Robinhood получает `open_position_quote_unavailable` вместо выхода (`autotrade.go:325-343`). Это сохраняется во всех последующих запусках, пока тикер не вернут в мониторинг.
- **Основание:** журнальная позиция Robinhood находится правильно, но расширение списка котировок происходит раньше и жёстко привязано к Webull. Для Webull аналогичный случай уже обработан.
- **Критерий исправления:** перед получением котировок включить тикеры открытых сделок всех исполняемых брокеров. Проверка: только Robinhood держит AAPL, мониторинг пуст, свежая котировка даёт сигнал выхода — должна отправиться одна SELL-заявка Robinhood.

## F03 — P1: трекер завершается даже при несохранённом исполнении

- **Уверенность: высокая.** `go/internal/live/track.go:506-513` вызывает `recordFill` без результата об ошибке и безусловно делает статус трекера окончательным. `trade_record.go:199-228` при отказе INSERT/UPDATE только пишет ошибку и блокирует новые входы; завершение трекера не отменяется.
- **Сценарий:** брокер подтвердил BUY; запись в `broker_trades` не проходит, но обновление `order_trackers` проходит (например, отдельное ограничение/SQL-trigger на журнале). Трекер становится `filled`, хотя сделка в брокерском журнале отсутствует. После восстановления базы обычный опрос незавершённых заявок уже не восстановит запись. Реальную позицию система видит как не связанную с журналом, что также блокирует автоматический выход.
- **Ограничение вывода:** блокировка новых входов уже есть и снижает риск повторной покупки. Дефект — потеря автоматического восстановления и учёта исполненной сделки, а не безусловный повтор BUY.
- **Критерий исправления:** запись исполнения и завершение трекера должны сохраняться согласованно; при ошибке журналирования исполнение остаётся доступным для безопасного повторного восстановления. Проверка: отклонить INSERT в broker_trades, подтвердить fill, снять отказ и проверить восстановление сделки без нового ордера.

## F04 — P1: запасной поиск исполнения Robinhood обращается к Webull

- **Уверенность: высокая.** `go/internal/live/track.go:328-334` при неизвестном статусе вызывает `findOrderSnapshot(id)`, а тот на `543-544` выбирает `defaultBroker()`. Найденный для трекера брокер `br` здесь теряется; ниже уже существует правильный помощник `findOrderSnapshotOn(br, id)`.
- **Сценарий:** у заявки Robinhood в деталях временно нет распознаваемого статуса, но исполнение уже доступно в истории Robinhood. Запасной поиск читает списки Webull и пропускает доступное подтверждение Robinhood. Если неполный detail сохраняется, через 64 опроса трекер становится `expired` без этого исполнения (`track.go:348-357`). Совпадения ID между брокерами для воспроизведения не требуется.
- **Критерий исправления:** все попытки получить состояние трекера используют его брокера. Проверка: RH detail возвращает неизвестный статус, RH history содержит FILLED с тем же ID, Webull пуст — журнал должен восстановить исполнение RH.

## F05 — P1: ручное закрытие Robinhood обходит учёт и защиту автоматических заявок

- **Уверенность: высокая.** `go/internal/httpapi/robinhood.go:118-135` вызывает `br.CloseMarket`; `go/internal/live/robinhood_broker.go:129-139` непосредственно отправляет SELL через `PlaceMarket`. Трекер исполнения не создаётся; проверок ожидающей продажи и резервирования отправки из `submitEvaluated` нет.
- **Сценарий:** оператор закрывает позицию Robinhood в интерфейсе, пока автоторговля включена. До исполнения SELL брокер ещё показывает позицию, а локального ожидающего трекера нет: автоматический выход может отправить вторую SELL. После исполнения ручной заявки журнал также не закрывается через обычный опрос трекеров и остаётся устаревшим.
- **Ограничение вывода:** исполнение второй SELL зависит от брокера; сам обход защиты и отсутствие учёта подтверждены кодом. Webull `Engine.ClosePosition` создаёт трекер, но также обходит проверку ожидающей продажи (`autotrade.go:1069-1097`), поэтому общая координация ручного и автоматического закрытия нужна обоим путям.
- **Критерий исправления:** ручная и автоматическая продажи используют общий механизм резервирования, сохранения и восстановления заявки с правильным брокером. Проверка: ручная продажа ещё не исполнена, затем приходит автоматический сигнал выхода — второй SELL не отправляется, первый попадает в журнал после исполнения.

## F06 — P1: ограничение времени T-1 не охватывает подготовительные запросы

- **Уверенность: высокая.** T-1 — запуск около минуты до закрытия биржи; его общий срок задаёт `execWindow`. Однако `executeWindow` вызывает `Evaluate()` без этого срока (`autotrade.go:500-510`); `heldSymbolsOn` игнорирует переданный callback-контекст и вызывает `br.Positions()` (`autotrade.go:431-437`). Далее `sizeOrder` использует `retryBrokerRead` с фоновым окном (`sizing.go:373-404`), а диагностический `logBalanceSnapshot` синхронно читает счёт Webull (`autotrade.go:883-890`).
- **Та же потеря срока в адаптерах:** Webull перед отправкой выполняет `ResolveInstrumentID` через обычный `Request` (`webull_broker.go:65-74`, `webull/client.go:395-404`); Robinhood получает account через `agenticAccount`/`tool(context.Background())` (`robinhood_broker.go:22-38,49-58,268-292`). Запасной поиск Webull detail тоже использует списки без переданного контекста (`webull_broker.go:302-347`).
- **Сценарий и влияние:** медленное чтение первого брокера расходует оставшееся до закрытия время и задерживает обработку второго брокера и отчёт. Операция не прерывается общим сроком, хотя он уже истёк; своевременный выход/вход может быть пропущен.
- **Ограничение вывода:** `placeMarket` повторно проверяет срок и POST использует контекст. Поэтому эти места сами по себе НЕ доказывают отправку новой заявки после закрытия; подтверждён дефект ограничения длительности и потеря торгового окна.
- **Критерий исправления:** один срок проходит через получение сигналов, позиции, расчёт размера, диагностику и адаптеры. Проверка с локальным медленным transport: истечение контекста останавливает подготовительный запрос и весь T-1, без ожидания отдельного сетевого таймаута.

## F07 — P1: частичное исполнение теряется при локальном истечении трекера

- **Уверенность: высокая.** `go/internal/live/track.go:336-356` не передаёт неокончательное частичное исполнение в `recordFill`: сохраняет только статус, увеличивает счётчик, а на 64-й попытке вызывает `finalizeTracker(t, "expired")` без полученного `detail`. В `trade_record.go:142-146` отсутствие переданного исполненного количества при статусе expired завершает обработку без записи сделки.
- **Сценарий:** BUY 10 акций исполнился на 4; брокер продолжает отвечать PARTIALLY_FILLED с `filled_qty=4`, остаток ещё работает. Все опросы знают о четырёх купленных акциях, но после лимита трекер локально становится expired, а в журнале нет ни одной. Брокерская заявка при этом не отменяется и её окончательный результат больше не опрашивается как pending.
- **Влияние:** потеря подтверждённого количества и автоматического восстановления; последующий выход блокируется отсутствием брокерской сделки в журнале. Обычный лимит опросов не является подтверждением истечения заявки у брокера.
- **Критерий исправления:** сохранять накопленное исполненное количество до окончательного статуса и не считать локальный лимит подтверждённым закрытием брокерской заявки. Проверка: 64 ответа PARTIALLY_FILLED 4/10 не должны уничтожить учёт четырёх исполненных акций и возможность сверки остатка.

## F08 — P1: заявка отправляется до устойчивого сохранения её идентификатора

- **Уверенность: высокая.** `go/internal/live/autotrade.go:549-554` создаёт новый clientOrderId (идентификатор клиентской заявки) непосредственно перед сетевой отправкой. Единственная запись трекера вызывается позднее, после возврата `placeMarket` (`execute_all.go:225-255`, `autotrade.go:683-695`). Предварительное резервирование в `execute_all.go:163-187` хранится только в памяти процесса.
- **Сценарий:** брокер принял заявку, процесс аварийно завершился до `startTracking`. После перезапуска нет ни трекера, ни сохранённого ID; `ResumeTrackers` восстанавливает только строки из базы. Уже исполненная позиция останется без связи с журналом и автоматического выхода. Для ручного/API-запуска до появления позиции возможна повторная покупка: открытая потерянная заявка не распознаётся как своя, а `cancelOpenOrdersBeforeEntry` оставляет чужие заявки и разрешает продолжение (`autotrade.go:1172-1174`, `execute_all.go:215-225`).
- **Ограничение вывода:** предварительная сверка T-1 может заблокировать повторную отправку при видимой открытой заявке. Она не восстанавливает утраченные метаданные и не применяется ко всем ручным/API-запускам.
- **Критерий исправления:** до сети сохранять намерение отправки с тем же ID, брокером и параметрами; после перезапуска сверять неопределённое состояние по этому ID. Проверка: остановить выполнение сразу после приёма заявки тестовым брокером, создать новый Engine с той же БД и убедиться, что он восстанавливает исходную заявку без второй отправки.

## F09 — P2: ошибка продления календаря исключает повторную попытку до следующего дня

- **Уверенность: высокая.** `go/internal/scheduler/scheduler.go:526-529` сохраняет `lastCalendarImportDate=today` независимо от ошибки `ImportWebullCalendar`. На последующих тиках проверка `513-515` немедленно возвращает `already-ran`.
- **Сценарий:** утром запрос календаря временно не прошёл; соединение восстановилось спустя минуту. До следующего дня импорт больше не пробуется. Если сохранённое покрытие уже закончилось, `RunTick` на `197-201` отключает биржевые задачи: восстановление сети само по себе не возобновит T-1 в этот день.
- **Ограничение вывода:** при ещё действующем календаре немедленного ущерба может не быть. Текущий код блокирует задачи при истёкшем известном покрытии; ошибочное время закрытия на этом основании не утверждается.
- **Критерий исправления:** различать успешное обновление и неудачную попытку; допускать ограниченный повтор после ошибки. Проверка: первый импорт завершается ошибкой, второй в тот же день после восстановления должен действительно обратиться к провайдеру.

## Итог и границы доказательства

**Автоторговлю нельзя считать готовой к надёжной работе без устранения P1.** Найдено 9 подтверждённых дефектов: 8 P1 и 1 P2. Самые критичные для первого исправления: F08 (повтор заявки после сбоя), F03/F07 (потеря учёта исполнения), F01 (ложное подтверждение отключения). Затем F05, F02/F04, F06; F09 — восстановление календаря.

Все девять сценариев проверены локально отдельными воспроизводящими проверками: F01–F08 в пакете live, F09 в scheduler. Для F05 выполнена проверка общего дефекта координации на Webull; отсутствие трекера в HTTP-пути Robinhood подтверждено чтением всей цепочки вызовов. Для F06 выполнена проверка игнорирования отменённого контекста в heldSymbolsOn; остальные перечисленные сетевые ветви проверены статически. Для F08 сбой имитируется остановкой стека после приёма заявки тестовым брокером с последующим созданием нового Engine на той же БД, а не реальным убийством процесса.

- `go test ./internal/live ./internal/store ./internal/scheduler ./internal/httpapi` — PASS.
- `go test -race ./internal/live ./internal/store ./internal/scheduler ./internal/httpapi ./internal/webull ./internal/robinhood` — PASS для всех шести пакетов. `-race` ищет небезопасный одновременный доступ к памяти; он не доказывает отсутствие логических повторов заявок или потери данных.
- Все `TestAuditF01` … `TestAuditF09` — PASS: эти проверки утверждают **наличие дефекта** на проверенном коде. После исправления соответствующая проверка должна перестать проходить, а постоянный регрессионный тест должен утверждать безопасное поведение.
- Исходники не менялись этим аудитом. Единственный отслеживаемый файл этого аудита — данный отчёт. Тесты подмешивались через Go overlay: компилятор видит временный файл, сам файл в каталоге исходников не создаётся.
- В процессе появились сторонние коммиты про backup, access log и версии Go. Они не меняли `go/internal/live`, `go/internal/store`, `go/internal/scheduler`; сравнение этих каталогов с `433abfa` пустое. Эти изменения не входят в аудит и не откатывались. Сервер не запускался, порт не занимался; push/deploy не выполнялись.
- Реальные заявки, брокерские credentials и production не использовались. Тестовые ответы не доказывают наличие описанных инцидентов на реальном счёте.

### Отброшенные или суженные выводы агентов

- Утверждение, что post-close actualization пропускает T-1 текущего дня: actualization вызывается после закрытия, а текущий scheduler уже допускает окна 10–12 и 0–2 минуты; приведённый агентом сценарий не подтверждён.
- Ошибка чтения внутри awaitFlatAfterExit действительно возвращает true, но последующий executeWindow снова проверяет журнал и позиции. Сам по себе этот фрагмент не доказывает повтор BUY; отдельный P1 не добавлен.
- Предположение о чужом fill из-за совпадения ID заменено на подтверждённый пропуск истории правильного брокера (F04).
- Не утверждается, что потерянный контекст сам по себе разрешает POST после закрытия: сохранены последующие deadline-проверки (F06).
- Ошибка MarkT1ExecutionFinished, устаревшее health-состояние и full fill при расхождении размера позиции оставлены кандидатами: существующие повторные проверки/сверка брокера не позволяют принять первоначальные сильные утверждения о повторных сделках без отдельного воспроизведения.
- Конкурентный Actualize не принят как обход daily cap в предложенном сценарии: ручной `force=true` намеренно обходит этот лимит и не записывает обычный счётчик. UpdatePositions относится к состоянию мониторинга; прямой ущерб автоторговле из предложенного сценария не доказан.

### Воспроизведение без изменения исходников

Запустить следующий Python-блок из корня репозитория. Он извлечёт сохранённые ниже два Go-блока в отдельный временный каталог, создаст overlay и выполнит только проверки аудита. Никаких реальных брокерских вызовов нет. Временный каталог удалится по завершении команды.

```python
import json, pathlib, re, subprocess, tempfile
root = pathlib.Path.cwd()
report = (root / "AUTOTRADE_READONLY_AUDIT_2026-09-04.md").read_text()
blocks = re.findall(r"```go\n(.*?)```", report, re.S)
assert len(blocks) == 2
with tempfile.TemporaryDirectory(prefix="mktorder-audit-") as tmp:
    tmp = pathlib.Path(tmp)
    replace = {}
    for package, source in zip(("live", "scheduler"), blocks):
        backing = tmp / (package + "_test.go")
        backing.write_text(source)
        virtual = root / "go/internal" / package / "audit_readonly_test.go"
        assert not virtual.exists()
        replace[str(virtual)] = str(backing)
    overlay = tmp / "overlay.json"
    overlay.write_text(json.dumps({"Replace": replace}))
    subprocess.run(["go", "test", "-overlay=" + str(overlay),
                    "./internal/live", "./internal/scheduler",
                    "-run", "^TestAudit", "-count=1", "-v"],
                   cwd=root / "go", check=True)
```


```go
package live

import (
	"context"
	"testing"
)

func TestAuditF01ConfigWriteFailure(t *testing.T) {
	db, e, _ := testEngine(t, entryBars)
	e.PatchAutoConfig(map[string]any{"enabled": true})
	_, err := db.SQL.Exec(`CREATE TRIGGER audit_deny_settings BEFORE UPDATE ON settings BEGIN SELECT RAISE(FAIL, 'audit write denied'); END`)
	if err != nil {
		t.Fatal(err)
	}
	result := e.PatchAutoConfig(map[string]any{"enabled": false})
	if result["enabled"] != false || e.AutoConfig()["enabled"] != true {
		t.Fatalf("unexpected result=%v stored=%v", result, e.AutoConfig())
	}
	t.Log("CONFIRMED: returned enabled=false while stored enabled=true")
}
func TestAuditF02RobinhoodExitWatchRemoved(t *testing.T) {
	e, _, rh := dualBrokerEngine(t, exitBars)
	holdAAPL(rh, 3)
	journalAAPL(t, e, "audit-rh", "robinhood", 3)
	if err := e.DB.DeleteWatch("AAPL"); err != nil {
		t.Fatal(err)
	}
	ev := e.Execute("t1")
	if len(rh.Orders) != 0 || ev.BrokerDecisions["robinhood"]["reason"] != "open_position_quote_unavailable" {
		t.Fatalf("unexpected orders=%v result=%+v", rh.Orders, ev)
	}
	t.Log("CONFIRMED: Robinhood exit quote absent after watch deletion")
}

func auditTracker(t *testing.T, e *Engine, id, broker, action string) map[string]any {
	t.Helper()
	row := map[string]any{"clientOrderId": id, "broker": broker, "symbol": "AAPL", "action": action, "quantity": 10.0, "status": "submitted", "dateKey": "2026-09-01"}
	if err := e.DB.SaveOrderTracker(row); err != nil {
		t.Fatal(err)
	}
	return e.DB.GetOrderTracker(id)
}
func TestAuditF03FinalizedWithoutJournal(t *testing.T) {
	db, e, _ := testEngine(t, entryBars)
	row := auditTracker(t, e, "audit-fill", "webull", "entry")
	_, err := db.SQL.Exec(`CREATE TRIGGER audit_deny_fill BEFORE INSERT ON broker_trades BEGIN SELECT RAISE(FAIL, 'audit write denied'); END`)
	if err != nil {
		t.Fatal(err)
	}
	e.finalizeTrackerStatus(row, map[string]any{"filled_qty": 10.0, "filled_price": 10.0}, "filled")
	if db.GetOrderTracker("audit-fill")["status"] != "filled" || db.GetTrade("broker_trades", "audit-fill") != nil {
		t.Fatal("unexpected state")
	}
	pending, err := db.ListPendingTrackers()
	if err != nil || len(pending) != 0 {
		t.Fatalf("pending=%v err=%v", pending, err)
	}
	t.Log("CONFIRMED: final tracker, no broker journal row, no pending recovery")
}
func TestAuditF04WrongBrokerFallback(t *testing.T) {
	e, _, rh := dualBrokerEngine(t, entryBars)
	id := "audit-rh-fallback"
	row := auditTracker(t, e, id, "robinhood", "entry")
	rh.Details = map[string]map[string]any{id: {"client_order_id": id, "status": "unknown"}}
	rh.Hist = []any{map[string]any{"client_order_id": id, "status": "FILLED", "filled_qty": 10.0, "filled_price": 10.0}}
	if e.findOrderSnapshotOn(rh, id) == nil {
		t.Fatal("RH history fixture missing")
	}
	_, err := e.pollTracker(row)
	if err != nil {
		t.Fatal(err)
	}
	if e.DB.GetOrderTracker(id)["status"] != "unknown" || e.DB.GetTrade("broker_trades", id) != nil {
		t.Fatal("unexpected state")
	}
	t.Log("CONFIRMED: available Robinhood fill ignored by fallback")
}
func TestAuditF05ManualCloseIgnoresPending(t *testing.T) {
	_, e, br := testEngine(t, exitBars)
	holdAAPL(br, 10)
	auditTracker(t, e, "existing-sell", "webull", "exit")
	result, err := e.ClosePosition("AAPL")
	if err != nil || !result.Submitted || len(br.Orders) != 1 {
		t.Fatalf("result=%v err=%v", result, err)
	}
	t.Log("CONFIRMED: manual SELL submitted while another exit tracker is pending")
}

func TestAuditF07PartialFillExpiresUnrecorded(t *testing.T) {
	db, e, br := testEngine(t, entryBars)
	id := "audit-partial"
	auditTracker(t, e, id, "webull", "entry")
	br.Details = map[string]map[string]any{id: {"client_order_id": id, "status": "PARTIALLY_FILLED", "filled_qty": 4.0, "filled_price": 10.0}}
	for i := 0; i < 64; i++ {
		_, err := e.pollTracker(db.GetOrderTracker(id))
		if err != nil {
			t.Fatal(err)
		}
	}
	if db.GetOrderTracker(id)["status"] != "expired" || db.GetTrade("broker_trades", id) != nil {
		t.Fatal("unexpected state")
	}
	t.Log("CONFIRMED: 64 known partial fills end expired with no journal")
}

type auditContextBroker struct {
	MemoryBroker
	normal, contextual int
}

func (b *auditContextBroker) Positions() ([]any, error) { b.normal++; return []any{}, nil }
func (b *auditContextBroker) PositionsCtx(ctx context.Context) ([]any, error) {
	b.contextual++
	return nil, ctx.Err()
}
func TestAuditF06PositionsIgnoreContext(t *testing.T) {
	_, e, _ := testEngine(t, entryBars)
	br := &auditContextBroker{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := e.heldSymbolsOn(br, windowFromCtx(ctx))
	if err != nil || br.normal != 1 || br.contextual != 0 {
		t.Fatalf("err=%v normal=%d contextual=%d", err, br.normal, br.contextual)
	}
	t.Log("CONFIRMED: cancelled context bypassed despite PositionsCtx support")
}

type auditCrashBroker struct {
	MemoryBroker
	crash bool
}

func (b *auditCrashBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	res, err := b.MemoryBroker.PlaceMarketCfg(symbol, side, qty, cfg)
	if b.crash {
		panic("audit crash after broker accepted")
	}
	return res, err
}
func TestAuditF08CrashBeforeTrackerDuplicates(t *testing.T) {
	db, e, _ := testEngine(t, entryBars)
	br := &auditCrashBroker{crash: true}
	e.Broker = br
	e.PatchAutoConfig(map[string]any{"enabled": true, "allowNewEntries": true, "lowIBS": 0.9})
	crashed := false
	func() {
		defer func() {
			if recover() != nil {
				crashed = true
			}
		}()
		e.Execute("manual_execute")
	}()
	if !crashed || len(br.Orders) != 1 {
		t.Fatal("crash fixture failed")
	}
	pending, err := db.ListPendingTrackers()
	if err != nil || len(pending) != 0 {
		t.Fatalf("pending=%v err=%v", pending, err)
	}
	br.crash = false
	resumed := New(db, e.quotes())
	resumed.Broker = br
	resumed.Now = e.Now
	resumed.Telegram = &MemoryTelegram{}
	resumed.ChatID = "c"
	resumed.ResumeTrackers()
	result := resumed.Execute("manual_execute")
	if !result.Submitted || len(br.Orders) != 2 {
		t.Fatalf("submitted=%v orders=%v", result.Submitted, br.Orders)
	}
	t.Log("CONFIRMED: broker accepted first BUY, restart submitted second BUY")
}
```

```go
package scheduler

import (
	"fmt"
	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"path/filepath"
	"testing"
	"time"
)

type auditCalendarBroker struct {
	live.MemoryBroker
	calls  int
	failed bool
}

func (b *auditCalendarBroker) CalendarDays(start, end string) ([]map[string]any, error) {
	b.calls++
	if b.failed {
		return nil, fmt.Errorf("audit temporary outage")
	}
	return []map[string]any{{"trade_day": start, "trade_date_type": "FULL_DAY"}}, nil
}
func TestAuditF09CalendarRetrySuppressed(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "audit.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	e := live.New(db, nil)
	now := time.Date(2026, 9, 1, 16, 0, 0, 0, time.UTC)
	e.Now = func() time.Time { return now }
	br := &auditCalendarBroker{failed: true}
	e.Broker = br
	deps := Deps{Live: e}
	RunCalendarExtend(db, deps, "2026-09-01", now, func(JobLog) {})
	if br.calls != 1 {
		t.Fatalf("first calls=%d", br.calls)
	}
	br.failed = false
	var last JobLog
	RunCalendarExtend(db, deps, "2026-09-01", now.Add(time.Minute), func(j JobLog) { last = j })
	if br.calls != 1 || last.Detail != "already-ran" {
		t.Fatalf("calls=%d last=%+v", br.calls, last)
	}
	t.Log("CONFIRMED: recovered calendar provider is not retried that day")
}
```
