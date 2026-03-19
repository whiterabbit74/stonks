# Webull API — бэклог доработок

---

## Справка по провайдерам котировок

### Finnhub

**REST:** `GET https://finnhub.io/api/v1/quote?symbol=AAPL&token=<key>`

- **Нет батч-эндпоинта** — один запрос на один тикер, это официально подтверждено
  (GitHub issue #11: "There is no way around that at the moment")
- Лимит free tier: **60 запросов/мин**, не более **30 запросов/сек**
- При 4-10 тикерах в список лимит не достигается

**WebSocket:** `wss://ws.finnhub.io?token=<key>`

- Одно соединение на API-ключ
- Подписка на тикер: `{"type":"subscribe","symbol":"AAPL"}`
- Получаешь каждую сделку в реальном времени: `s` (symbol), `p` (price), `t` (timestamp ms), `v` (volume)
- Free tier: до **50 символов** на соединение
- Отдаёт `last trade price`, не OHLC-снапшот — для расчёта IBS достаточно (нужна только текущая цена)
- Потенциальная замена поллинга каждые 15 сек на странице /results

### Webull snapshot

**REST:** `GET /openapi/market-data/stock/snapshot?symbols=AAPL,MSFT&category=US_STOCK`

- **Поддерживает батч** — до ~100 символов через запятую
- Поле `price` = текущая intraday цена; поле `close` в торговые часы = вчерашнее закрытие
- Используем для автоторговли (один запрос на все тикеры за 1 мин до закрытия)
- Лимиты низкие на текущем тарифе — не использовать для частого поллинга

---

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
