# EMA Take Profit Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** исправить расчет `take profit` на странице акций, добавить недельные свечи и чистые подписи на графиках, создать отдельную страницу EMA-стратегии, добавить EMA-оповещения в мониторинг Telegram, отвязать мониторинг от обязательного исполнения брокером и добавить вкладку экспозиции.

**Architecture:** сохранить текущую React + TypeScript + Vite архитектуру фронтенда, вынести повторяемую финансовую логику в чистые функции `src/lib`, переиспользовать существующие компоненты результатов бэктеста, расширить серверные сервисы Express/SQLite для EMA-оповещений и мониторинга.

**Tech Stack:** React 19, TypeScript 5.8, Zustand, `lightweight-charts`, Vitest, Playwright, Express 5, SQLite через `better-sqlite3`.

---

## Термины

- **Бэктест**: историческая проверка стратегии на прошлых свечах, чтобы понять, какие сделки были бы совершены.
- **Свеча OHLC**: одна точка цены за период: `open` открытие, `high` максимум, `low` минимум, `close` закрытие.
- **Take profit / TP**: цена фиксации прибыли. Если после входа цена дошла до цели, позиция закрывается раньше обычного сигнала.
- **EMA**: экспоненциальная скользящая средняя, то есть сглаженная линия цены, где свежие цены имеют больший вес.
- **EMA20 / EMA200**: EMA с периодом 20 или 200 свечей.
- **Отклонение от EMA**: процентная разница между ценой и EMA: `(цена / EMA - 1) * 100`.
- **Маржинальность / плечо**: торговля на сумму больше собственного капитала. 200% означает позицию в два раза больше капитала.
- **Капитал / equity**: текущая стоимость портфеля с учетом наличных денег, открытых позиций и долга по марже.
- **Экспозиция**: насколько стратегия загружена позицией. Например, позиция на весь капитал равна 100%, позиция с плечом 2x равна 200%.
- **Просадка / drawdown**: падение капитала от предыдущего максимума.
- **Profit factor**: сумма прибыльных сделок, деленная на модуль суммы убыточных сделок.
- **LocalStorage**: хранилище браузера, где сайт запоминает выбранные настройки.
- **CRUD**: базовые операции с записью: создать, прочитать, обновить, удалить.

## Текущие точки проекта

- Страница акций: `src/components/MultiTickerPage.tsx`.
- Основной расчет мульти-тикерной позиции: `src/lib/singlePositionBacktest.ts`.
- Второй движок бэктеста, который тоже умеет TP: `src/lib/backtest.ts`.
- Тесты TP: `src/lib/__tests__/singlePositionBacktest.test.ts` и `src/components/__tests__/MultiTickerPage.takeProfit.test.tsx`.
- График цены со свечами и EMA: `src/components/TradingChart.tsx`.
- Графики результатов: `src/components/BacktestResultsView.tsx`, `src/components/EquityChart.tsx`, `src/components/TradeDrawdownChart.tsx`, `src/components/DurationAnalysis.tsx`, `src/components/ProfitFactorAnalysis.tsx`, `src/components/OpenDayDrawdownChart.tsx`, `src/components/MultiTickerChart.tsx`, `src/components/MiniQuoteChart.tsx`.
- Навигация: `src/components/AppRouter.tsx`.
- Вкладки анализа и сохранение видимости: `src/stores/index.ts`.
- Telegram-мониторинг: `src/components/TelegramWatches.tsx`, `src/lib/api.ts`, `server/src/routes/telegram.js`, `server/src/services/telegram.js`, `server/src/services/telegramAggregation.js`.
- Проверка связки мониторинг-брокер: `server/src/services/monitorConsistency.js`.
- Сделки мониторинга: `server/src/services/trades.js`, `server/src/routes/trades.js`.

## Важные правила расчета

- Existing-position TP проверяется до обычных сигналов выхода.
- Если позиция была открыта раньше текущей свечи и `high >= takeProfitPrice`, выход идет по точной цене TP, а не по `close`.
- После TP на текущей свече можно открыть новую позицию на закрытии этой же свечи, если входной сигнал есть. Это меняет количество сделок.
- Новая позиция, открытая на закрытии свечи, не может закрыться по максимуму этой же свечи, потому что в принятой модели максимум уже был внутри свечи до закрытия. Это защищает от нереалистичного “вошли на close и тут же вышли по high той же свечи”.
- Для EMA-стратегии одна выбранная EMA управляет всеми зонами. Нельзя смешивать зоны от EMA20 и EMA200 в одном прогоне.
- Для EMA-зон открытая покупка хранится по ключу `ticker + buyZoneId`. Если позиция от этой зоны уже есть, повторно покупать эту же зону нельзя.
- При нескольких buy-зонах доля каждой зоны равна `1 / количество включенных buy-зон`.
- При нескольких sell-зонах каждая sell-зона продает равную долю доступной позиции.
- Галочка `Не продавать в минус` запрещает закрывать лоты, где расчетный результат после комиссий меньше нуля.
- Мониторинг должен считать свое состояние источником истины. Брокерское исполнение становится дополнительным действием, а не обязательным условием для открытия/закрытия позиции в мониторинге.

## Риски и решения

- **Два TP-движка.** TP сейчас есть и в `singlePositionBacktest.ts`, и в `backtest.ts`. Решение: вынести общие функции TP и выхода в `src/lib/backtest-execution.ts`, затем подключить оба движка.
- **Внутридневной порядок свечи неизвестен.** В дневной свече мы знаем только `open/high/low/close`, но не знаем порядок движения внутри дня. Решение: использовать консервативное правило “старую позицию можно закрыть по high, новую позицию открываем только на close”.
- **Недельные свечи могут скрыть сделки.** Сделки датированы дневными датами, а недельная свеча имеет одну дату. Решение: маппить дату сделки в соответствующую недельную свечу.
- **Уровень EMA 0% неоднозначен.** Для оповещения “0” нужно понимать, с какой стороны уровень считается достигнутым. Решение: в UI дать направление `выше` или `ниже`; для уровней выше нуля по умолчанию `выше`, ниже нуля по умолчанию `ниже`.
- **Спреды на странице акций явно не найдены как отдельная текущая вкладка.** Решение: на EMA-странице добавить вкладку `Спреды` только если она будет привязана к существующему смыслу в проекте. Если отдельного смысла нет, в первой реализации показывать таблицу расстояний между зонами покупки и продажи, потому что это фактический “спред” стратегии.

---

## Phase 1: Зафиксировать TP ручными тестами

- [ ] Открыть `src/lib/__tests__/singlePositionBacktest.test.ts`.
- [ ] Добавить тест `closes take profit and re-enters on the same bar`.
- [ ] Использовать ручной контрольный пример без комиссий и без плеча:

```ts
const data = [
  { date: '2024-01-01', open: 101, high: 112, low: 99, close: 100 },
  { date: '2024-01-02', open: 100, high: 103, low: 98, close: 98.2 },
  { date: '2024-01-03', open: 99, high: 101, low: 98, close: 99 },
];
```

- [ ] Ожидаемая арифметика:
  - Вход 2024-01-01 по 100, количество 100, капитал 10000.
  - TP 2% дает выход 2024-01-02 по 102, капитал 10200.
  - Вход в тот же день по 98.2, количество `floor(10200 / 98.2) = 103`, свободные деньги 85.4.
  - TP второй позиции: `98.2 * 1.02 = 100.164`.
  - Выход 2024-01-03: `103 * 100.164 + 85.4 = 10402.292`.
  - Ожидаем 2 сделки и итоговый капитал около `10402.292`.
- [ ] Добавить тест `does not take profit on the entry candle high after close entry`.
- [ ] Добавить тест `prioritizes take profit before IBS exit`.
- [ ] Добавить тест для `MultiTickerPage`, что custom TP передается и в основной расчет, и в расчет с ежемесячным пополнением.
- [ ] Запустить:

```bash
npx vitest run src/lib/__tests__/singlePositionBacktest.test.ts src/components/__tests__/MultiTickerPage.takeProfit.test.tsx
```

## Phase 2: Убрать дублирование TP-логики

- [ ] Создать `src/lib/backtest-execution.ts`.
- [ ] Перенести туда чистые функции:

```ts
export function normalizeTakeProfitPercent(value: unknown): number | null
export function calculateTakeProfitPrice(entryPrice: number, takeProfitPercent: number): number
export function shouldTakeProfit(barHigh: number, takeProfitPrice: number | null): boolean
export function calculateExposurePct(positionValue: number, equity: number): number
```

- [ ] Обновить `src/lib/singlePositionBacktest.ts`, чтобы он использовал эти функции.
- [ ] Обновить `src/lib/backtest.ts`, чтобы правила TP совпадали с мульти-тикерным расчетом.
- [ ] Проверить, что `takeProfit` в `Trade.context` сохраняет:
  - `takeProfitPrice`;
  - `takeProfitPercent`;
  - `exitReason: 'take_profit'`;
  - `entryDate`;
  - `exitDate`.
- [ ] Запустить:

```bash
npx vitest run src/lib/__tests__/singlePositionBacktest.test.ts
npx vitest run src/lib/__tests__/backtest.test.ts
```

## Phase 3: Недельные свечи и запоминание периода

- [ ] Создать `src/lib/candles.ts`.
- [ ] Добавить функции:

```ts
export type CandleTimeframe = 'daily' | 'weekly';
export function aggregateOhlcToWeekly(data: OHLCData[]): OHLCData[]
export function mapDateToAggregatedBarTime(date: string, timeframe: CandleTimeframe, bars: OHLCData[]): string
```

- [ ] Правила недельной свечи:
  - `open`: первое открытие недели;
  - `high`: максимум недели;
  - `low`: минимум недели;
  - `close`: последнее закрытие недели;
  - `volume`: сумма объема;
  - `date`: дата последней торговой свечи недели.
- [ ] Добавить `timeframe` в `ChartPrefs` в `src/components/TradingChart.tsx`.
- [ ] Сохранять `timeframe` в `LS.CHART_PREFS`.
- [ ] Добавить переключатель `День / Неделя` в `TradingChart`.
- [ ] Применить недельную агрегацию к свечам, EMA и маркерам сделок.
- [ ] Расширить `HeroLineChart` и `MultiTickerChart`, если там отображаются ценовые данные по свечам или временные ряды, где недельный вид уместен.
- [ ] Добавить тесты:

```bash
npx vitest run src/lib/__tests__/candles.test.ts
```

## Phase 4: Убрать текстовые подписи справа на графиках

- [ ] В `src/components/TradingChart.tsx` убрать `title` у series для:
  - объема;
  - IBS;
  - EMA20;
  - EMA200;
  - свечей.
- [ ] В `src/components/MultiTickerChart.tsx` убрать `title` у серий тикеров.
- [ ] В `src/components/EquityChart.tsx` убрать `title` у линий капитала, если он попадает в правую шкалу.
- [ ] В `src/components/OpenDayDrawdownChart.tsx` убрать `title` у price lines `0%` и `Средняя`, оставить только числовые значения шкалы.
- [ ] В `src/components/TradeDrawdownChart.tsx`, `DurationAnalysis.tsx`, `ProfitFactorAnalysis.tsx`, `MiniQuoteChart.tsx` убрать названия из правой части графика.
- [ ] Создать переиспользуемый `src/components/ChartLegend.tsx`.
- [ ] Под графиками показывать легенду: цвет и название линии. Это заменяет подписи справа.
- [ ] Добавить тест, который проверяет, что `TradingChart` не передает `title: 'EMA 200'` в `lightweight-charts`.

## Phase 5: Переименование “Баланс” в “Капитал”, компактные числа и сравнение маржи

- [ ] В `src/stores/index.ts` заменить label вкладки `equity` с `Баланс` на `Капитал`.
- [ ] В `src/components/BacktestResultsView.tsx` заменить пользовательские тексты `баланс` на `капитал`, где речь про стоимость портфеля.
- [ ] В `src/components/TelegramWatches.tsx` заменить тексты графика мониторинга на `капитал`.
- [ ] Создать или расширить форматтеры:

```ts
export function formatCompactNumber(value: number): string // 12300 -> 12.3K
export function formatCompactCurrency(value: number): string // 1230000 -> $1.23M
```

- [ ] Применить компактный формат к правым шкалам графиков капитала, где значения большие.
- [ ] На странице акций считать два результата, если маржинальность больше 100%:
  - без маржи: `leverage = 1`;
  - с маржей: `leverage = leveragePercent / 100`.
- [ ] Передавать оба результата в `BacktestResultsView`.
- [ ] Под графиком капитала показывать легенду: какой цвет без маржи, какой с маржей.
- [ ] Повторить эту схему для будущей EMA-страницы.

## Phase 6: Вкладка “Экспозиция”

- [ ] В `src/types/index.ts` добавить:

```ts
export interface ExposurePoint {
  date: string;
  equity: number;
  positionValue: number;
  exposurePct: number;
  activePositions: number;
}
```

- [ ] Расширить `BacktestResult` полем `exposure?: ExposurePoint[]`.
- [ ] В `src/lib/singlePositionBacktest.ts` считать экспозицию на каждую дату:
  - без позиции: `0`;
  - с позицией: `positionValue / equity * 100`;
  - при плече значение может быть выше 100%.
- [ ] Создать `src/components/ExposureChart.tsx`.
- [ ] Добавить вкладку `exposure` в `src/stores/index.ts`:

```ts
{ id: 'exposure', label: 'Экспозиция', visible: true }
```

- [ ] Добавить обработку вкладки в `BacktestResultsView`.
- [ ] Добавить тесты расчета экспозиции на ручном наборе сделок.

## Phase 7: Ядро EMA-стратегии

- [ ] Создать `src/lib/ema-zone-strategy.ts`.
- [ ] Добавить типы в `src/types/index.ts`:

```ts
export type EmaPeriod = 20 | 200;
export type EmaSignalSource = 'close' | 'intraday';

export interface EmaZone {
  id: string;
  levelPct: number;
  enabled: boolean;
}

export interface EmaZoneStrategyParams {
  tickers: string[];
  emaPeriod: EmaPeriod;
  buyZones: EmaZone[];
  sellZones: EmaZone[];
  takeProfitPercent: number | null;
  noSellAtLoss: boolean;
  leverage: number;
  signalSource: EmaSignalSource;
}
```

- [ ] Реализовать расчет EMA через общий helper, а не локальную копию из `TradingChart.tsx`.
- [ ] Для каждой даты и тикера считать `deviationPct`.
- [ ] Правило покупки:
  - если buy-зона включена;
  - уровень достигнут;
  - открытого лота от этой зоны сейчас нет;
  - есть доступный капитал;
  - покупается доля `1 / count(enabledBuyZones)` от целевой экспозиции.
- [ ] Правило продажи:
  - TP проверяется раньше sell-зон;
  - sell-зона продает долю `1 / count(enabledSellZones)`;
  - при `Не продавать в минус` убыточные лоты не закрываются;
  - закрытие лотов делать FIFO, то есть сначала самые старые покупки.
- [ ] Для `signalSource: 'close'` вход/выход проверяется по `close`.
- [ ] Для `signalSource: 'intraday'`:
  - buy-зона достигается через `low`;
  - sell-зона достигается через `high`;
  - цена исполнения равна `EMA * (1 + levelPct / 100)`.
- [ ] Вернуть стандартный `BacktestResult`, чтобы работали существующие вкладки:
  - summary;
  - price;
  - capital;
  - drawdown;
  - trades;
  - profit factor;
  - duration;
  - exposure.
- [ ] Добавить `src/lib/__tests__/ema-zone-strategy.test.ts`.
- [ ] Ручные проверки:
  - одна buy-зона покупает 100%;
  - две buy-зоны покупают по 50%;
  - четыре buy-зоны покупают по 25%;
  - зона не покупается повторно, пока открытый лот этой зоны не закрыт;
  - после закрытия зона может купить снова;
  - `Не продавать в минус` не закрывает убыточный лот;
  - TP закрывает раньше sell-зоны.

## Phase 8: Страница EMA

- [ ] Создать `src/components/EmaStrategyPage.tsx`.
- [ ] По умолчанию использовать тикер `TQQQ`.
- [ ] Добавить сохранение настроек в `localStorage`:
  - тикеры;
  - EMA период 20/200;
  - buy-зоны;
  - sell-зоны;
  - маржинальность;
  - TP;
  - `Не продавать в минус`;
  - источник сигнала `close/intraday`.
- [ ] Создать `src/components/EmaZoneEditor.tsx`.
- [ ] В форме параметров дать:
  - ввод нескольких тикеров;
  - выбор EMA20 или EMA200;
  - список buy-зон;
  - список sell-зон;
  - маржинальность;
  - TP;
  - источник данных входа;
  - чекбокс `Не продавать в минус`.
- [ ] В `src/components/AppRouter.tsx` добавить route `/ema`.
- [ ] Добавить пункт навигации `EMA`.
- [ ] Использовать `BacktestResultsView` для общих вкладок.
- [ ] Добавить отдельную вкладку `Отклонение от EMA`.
- [ ] Создать `src/components/EmaDeviationChart.tsx`.
- [ ] На графике отклонения:
  - центральная линия `0`;
  - шкала в процентах;
  - переключатель дневной/недельный;
  - выбранная EMA20/EMA200;
  - горизонтальные линии buy/sell-зон;
  - маркеры покупок/продаж;
  - легенда под графиком.
- [ ] Добавить тесты:

```bash
npx vitest run src/components/__tests__/EmaStrategyPage.test.tsx
npx vitest run src/components/__tests__/EmaDeviationChart.test.tsx
```

## Phase 9: EMA-оповещения в мониторинге

- [ ] В SQLite добавить таблицу `telegram_ema_alerts`.
- [ ] Поля:
  - `id`;
  - `symbol`;
  - `ema_period`;
  - `level_pct`;
  - `direction`;
  - `threshold_pct`;
  - `enabled`;
  - `created_at`;
  - `updated_at`.
- [ ] Создать `server/src/services/emaAlerts.js`.
- [ ] Добавить функции:

```js
listEmaAlerts()
createEmaAlert(payload)
updateEmaAlert(id, payload)
deleteEmaAlert(id)
evaluateEmaAlerts({ now, quoteProvider, historyProvider })
```

- [ ] В `server/src/routes/telegram.js` добавить endpoints:
  - `GET /telegram/ema-alerts`;
  - `POST /telegram/ema-alerts`;
  - `PATCH /telegram/ema-alerts/:id`;
  - `DELETE /telegram/ema-alerts/:id`.
- [ ] В `src/lib/api.ts` добавить методы для EMA-оповещений.
- [ ] В `src/types/index.ts` добавить тип `TelegramEmaAlertRecord`.
- [ ] В `src/components/TelegramWatches.tsx` добавить вкладку `EMA`.
- [ ] Во вкладке EMA дать:
  - выбор акции;
  - EMA20/EMA200;
  - уровень в процентах;
  - направление `выше/ниже`;
  - порог близости для предупреждения;
  - включение/выключение.

## Phase 10: Включить EMA-оповещения в Telegram-сообщения T-11 и T-1

- [ ] В `server/src/services/telegramAggregation.js` перед сборкой сообщения загрузить активные EMA-оповещения.
- [ ] Для T-11 добавлять секцию “EMA-оповещения”, если цена близко к уровню:
  - `abs(currentDeviationPct - levelPct) <= thresholdPct`.
- [ ] Для T-1 добавлять секцию “EMA-оповещения”, если уровень достигнут:
  - `direction: 'above'` и `deviationPct >= levelPct`;
  - `direction: 'below'` и `deviationPct <= levelPct`.
- [ ] EMA-оповещения не должны отправлять брокерские заявки.
- [ ] Добавить тесты:

```bash
npx vitest run server/src/services/__tests__/emaAlerts.test.js
npx vitest run server/src/services/__tests__/telegramAggregation.emaAlerts.test.js
```

## Phase 11: Отвязать мониторинг от обязательных брокерских сделок

- [ ] В `server/src/services/monitorConsistency.js` понизить `monitor_trade_without_broker_position` с блокирующей ошибки до предупреждения.
- [ ] Изменить `getBlockingMonitorMismatch`, чтобы отсутствие брокерской позиции не останавливало мониторинг.
- [ ] В `server/src/services/telegramAggregation.js` убрать логику, которая пропускает все сигналы при таком mismatch.
- [ ] При входном сигнале:
  - сначала создать/обновить позицию мониторинга;
  - затем пробовать брокерскую заявку, если интеграция включена;
  - если брокер не исполнил, оставить позицию мониторинга открытой с note о причине.
- [ ] При выходном сигнале:
  - сначала закрыть позицию мониторинга;
  - затем пробовать брокерскую заявку;
  - если брокер не исполнил, сохранить закрытие мониторинга и note о брокерской ошибке.
- [ ] В `server/src/services/trades.js` сохранить источник:
  - `telegram_monitor_entry`;
  - `telegram_monitor_exit`;
  - `telegram_broker_submitted`;
  - `telegram_broker_failed`.
- [ ] Обновить UI статусы в `TelegramWatches.tsx`, чтобы предупреждения брокера не выглядели как запрет мониторинга.
- [ ] Обновить тесты:

```bash
npx vitest run server/src/services/__tests__/monitorConsistency.test.js
npx vitest run server/src/services/__tests__/telegramAggregation.mismatch.test.js
npx vitest run server/src/services/__tests__/monitorState.integration.test.js
```

## Phase 12: Финальная проверка фронтенда

- [ ] Запустить типизацию и сборку:

```bash
npm run build:check
```

- [ ] Запустить основной набор unit-тестов:

```bash
npm run test:run
```

- [ ] Запустить локальный dev server:

```bash
npm run dev
```

- [ ] Проверить в браузере:
  - `/stocks`: TP меняет количество сделок и капитал по ручному примеру;
  - `/stocks`: недельные свечи включаются и сохраняются после перезагрузки;
  - `/stocks`: справа на графике только числовые значения;
  - `/stocks`: вкладка `Капитал`, а не `Баланс`;
  - `/stocks`: при включенной марже видны линии без маржи и с маржей;
  - `/stocks`: есть вкладка `Экспозиция`;
  - `/ema`: по умолчанию тикер `TQQQ`;
  - `/ema`: несколько buy/sell-зон работают равными долями;
  - `/ema`: `Не продавать в минус` блокирует убыточные продажи;
  - `/ema`: график отклонения показывает 0, зоны и сделки;
  - `/monitoring`: появилась вкладка EMA-оповещений;
  - Telegram T-11/T-1 включает EMA-оповещения.

## Phase 13: Финальная проверка расчетов вручную

- [ ] Сравнить ручной TP-пример из Phase 1 с результатом UI.
- [ ] Сделать EMA fixture с одной buy-зоной и одной sell-зоной:
  - капитал 10000;
  - buy-зона -20%;
  - sell-зона +40%;
  - без комиссий;
  - без маржи;
  - одна акция.
- [ ] Проверить руками:
  - дату входа;
  - цену входа;
  - количество акций;
  - дату выхода;
  - цену выхода;
  - прибыль;
  - итоговый капитал.
- [ ] Повторить с двумя buy-зонами, чтобы каждая покупала 50%.
- [ ] Повторить с четырьмя buy-зонами, чтобы каждая покупала 25%.
- [ ] Повторить с маржей 200%, чтобы экспозиция могла достигать 200%.

## Suggested Commit Boundaries

- [ ] Commit 1: TP execution rules, shared helpers, tests.
- [ ] Commit 2: chart timeframe, weekly candles, right-side labels, chart legends.
- [ ] Commit 3: capital naming, compact formatting, margin comparison, exposure tab.
- [ ] Commit 4: EMA strategy core and tests.
- [ ] Commit 5: EMA page and deviation chart.
- [ ] Commit 6: EMA monitoring alerts UI/API/server.
- [ ] Commit 7: monitoring decoupled from broker execution and Telegram tests.

## Commands Reference

```bash
npx vitest run src/lib/__tests__/singlePositionBacktest.test.ts
npx vitest run src/lib/__tests__/candles.test.ts
npx vitest run src/lib/__tests__/ema-zone-strategy.test.ts
npx vitest run src/components/__tests__/MultiTickerPage.takeProfit.test.tsx
npx vitest run src/components/__tests__/EmaStrategyPage.test.tsx
npx vitest run server/src/services/__tests__/telegramAggregation.mismatch.test.js
npm run test:run
npm run build:check
```

