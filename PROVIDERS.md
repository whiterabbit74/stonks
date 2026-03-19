# Data Providers — Limits & Notes

Summary of free tier limits and known quirks for each market data provider used in the app.

---

## Alpha Vantage

**Free tier:** 25 requests/day, 5 requests/minute

**Historical data:**
- `TIME_SERIES_DAILY` — бесплатно, но **`outputsize=full` — платная фича**. На free возвращает только последние **100 дней** (`outputsize=compact`).
- `TIME_SERIES_DAILY_ADJUSTED` — аналогично.
- Наш код передаёт `outputsize=full` → на free-аккаунте приходит ответ с `Information`: _"The outputsize=full parameter value is a premium feature"_, что мы ловим как "Достигнут лимит API Alpha Vantage".

**Вывод:** Alpha Vantage **не пригоден для загрузки полной истории** на free-тарифе. Использовать только если есть платный план.

**Ключ:** `ALPHA_VANTAGE_API_KEY`

---

## Finnhub

**Free tier:** 60 requests/минуту, 30 calls/second глобальный лимит

**Historical data:**
- Endpoint `/stock/candle` — **требует платного плана**. На free возвращает 403 "You don't have access to this resource".
- Endpoint `/quote` (текущая цена) — работает бесплатно.

**Вывод:** Finnhub **не пригоден для загрузки исторических данных** на free-тарифе. Использовать только для real-time котировок и мониторинга IBS.

**Ключ:** `FINNHUB_API_KEY`

---

## Twelve Data

**Free tier:** 8 запросов/минуту, 800 запросов/день

**Historical data:**
- Поддерживает полную историю (конкретная глубина не задокументирована для free).
- 8 req/min — достаточно для ручной загрузки, но не для массового обновления.

**Вывод:** Рабочая альтернатива Finnhub. Подойдёт для единичных загрузок.

**Ключ:** `TWELVE_DATA_API_KEY`

---

## Polygon.io

**Free tier:** Неограниченный доступ к **историческим** данным (задержка 15 минут на real-time). Нет явного лимита на количество запросов к историческим эндпоинтам.

**Historical data:**
- Endpoint `/v2/aggs/ticker/{ticker}/range/...` — полная история бесплатно.
- Real-time котировки (для мониторинга) — только с задержкой 15 мин на free.

**Вывод:** Хороший источник для исторических данных. Не подходит для real-time мониторинга на free-тарифе.

**Ключ:** `POLYGON_API_KEY`

---

## Webull

**Доступ:** Требует регистрации в Webull Developer Portal, получения `APP_KEY` и `APP_SECRET`.

**Historical data:** **Не поддерживается** через наш integration. Webull OpenAPI предоставляет только snapshot текущего дня (`/openapi/market-data/stock/snapshot`). Попытка загрузить исторические данные через Webull вернёт ошибку.

**Real-time:** Используется для мониторинга IBS и автоторговли (через `fetchTodayRangeAndQuoteViaWebull`).

**Ключи:** `WEBULL_APP_KEY`, `WEBULL_APP_SECRET`, `WEBULL_ACCESS_TOKEN`, `WEBULL_ACCOUNT_ID`

---

## Рекомендации по выбору провайдера

| Задача | Рекомендуемый провайдер |
|--------|------------------------|
| Загрузка исторических данных (Новые данные) | **Polygon** или Twelve Data |
| Обновление датасета (Results → Refresh) | **Polygon** или Twelve Data |
| Real-time котировки для мониторинга | **Finnhub** или Webull |
| Автоторговля | **Webull** |
| Если есть платный план | Alpha Vantage (высокое качество данных) |
