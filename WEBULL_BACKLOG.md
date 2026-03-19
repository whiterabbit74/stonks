# Webull API — бэклог доработок

## 1. ~~Котировки в торговом скрипте — сейчас Finnhub, можно Webull~~ ✅ Сделано (2026-03-18)

**Файл:** `server/src/services/autotrade.js:8`

```js
const { fetchTodayRangeAndQuote } = require('../providers/finnhub');
```

Жёстко прописан Finnhub. При входе за 1 минуту до закрытия цена берётся из Finnhub.
Webull возвращает котировку через `GET /openapi/market-data/stock/snapshot` — это их собственные данные,
точнее для расчёта LIMIT-слиппажа.

**Что сделать:**
Добавить `getWebullSnapshot(symbol)` в `webullClient.js`, создать провайдер-обёртку
`server/src/providers/webullQuote.js` и переключить `fetchTodayRangeAndQuote` на Webull
(или сделать выбор через настройки).

---

## 2. Корпоративные действия (сплиты / дивиденды)

**Эндпоинт:** `GET /instrument/corp-action?instrument_id=...&type=split`

Возвращает историю сплитов по instrument_id. Может автоматически пополнять `server/splits.json`
для торгуемых тикеров — избавит от ручного ввода в разделе `/split`.

**Что сделать:**
Добавить функцию `getCorporateActions(instrumentId, type)` в `webullClient.js`.
Сделать endpoint `POST /api/splits/:symbol/sync-webull` — при вызове резолвит instrument_id
по тикеру, запрашивает сплиты и мержит в `splits.json`.

---

## 3. Торговый календарь Webull

**Эндпоинт:** `GET /trade/calendar?market=US_STOCK`

Возвращает торговые/нерабочие дни. Сейчас `server/trading-calendar.json` ведётся вручную.

**Что сделать:**
Добавить `getTradeCalendar()` в `webullClient.js` и кнопку "Синхронизировать с Webull"
на странице `/calendar`.

---

## 4. Исторические данные через Webull (замена Alpha Vantage / Twelve Data)

**Эндпоинт:** `GET /openapi/market-data/stock/bars?instrument_id=...&type=1d&count=500`

Webull может отдавать OHLCV-историю напрямую без лимитов Alpha Vantage.

**Что сделать:**
Новый провайдер `server/src/providers/webullBars.js` + подключить как опцию
при рефреше датасетов (`POST /api/datasets/:id/refresh`).

---

## 5. Полная история ордеров — пагинация

**Сделано (2026-03-18):** дашборд теперь тянет `/openapi/trade/order/history` за последние 30 дней.

Для пагинации по страницам (если истории больше 100 позиций) нужно передавать `last_order_id`
из последнего ордера предыдущей страницы. Сейчас страница одна — 100 записей.

**Что сделать (при необходимости):**
Добавить кнопку "Загрузить ещё" на вкладке Сделки с передачей `last_order_id`.

---

## 6. Расширенные часы торгов (Extended Hours) при ручном закрытии

**Файл:** `autotrade.js` — все SELL ордера

Если позиция закрывается вручную через `/broker` после 16:00 ET, ордер уйдёт с
`extended_hours_trading: false` и Webull может отклонить его.

**Что сделать:**
В `executeWebullSignal({ action: 'exit' })` определять текущее время ET:
если не регулярная сессия (до 09:30 или после 16:00) — выставлять `extended_hours_trading: true`.
