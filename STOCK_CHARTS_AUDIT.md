# Аудит графиков акций по страницам сайта

Дата аудита: 2026-02-14
Формат: статический аудит кода + сверка с актуальной документацией Lightweight Charts.

## Что проверено
- Роуты и вкладки, где отрисовываются графики.
- Все компоненты на `lightweight-charts`.
- Текущая версия библиотеки и совместимость с актуальной документацией.
- Технические риски: lifecycle, даты/время, resize, производительность, тестовое покрытие.

Проверка сборки:
- `npm run -s build:check` -> есть ошибки компиляции (в т.ч. в графическом коде).

## Карта графиков по страницам
- `/results` (SingleTickerPage):
- `TradingChart` (цена)
- `EquityChart` (equity)
- `TradeDrawdownChart` (просадка)
- `ProfitFactorAnalysis`
- `DurationAnalysis`
- `OpenDayDrawdownChart`
- `MiniQuoteChart` внутри `TickerCard`

- `/multi-ticker`:
- `MultiTickerChart` (сводный график)
- `EquityChart`
- `TradeDrawdownChart`
- `ProfitFactorAnalysis`
- `DurationAnalysis`
- `MiniQuoteChart` в `TickerCardsGrid`

- `/multi-ticker-options`:
- тот же набор, что и `/multi-ticker`, через `BacktestResultsView`.

Точки подключения:
- `src/components/AppRouter.tsx:355`
- `src/components/AppRouter.tsx:356`
- `src/components/AppRouter.tsx:357`
- `src/components/BacktestResultsView.tsx:127`
- `src/components/BacktestResultsView.tsx:152`
- `src/components/BacktestResultsView.tsx:191`
- `src/components/BacktestResultsView.tsx:208`
- `src/components/BacktestResultsView.tsx:320`
- `src/components/BacktestResultsView.tsx:335`
- `src/components/TickerCard.tsx:116`

## Ключевые находки (по приоритету)

### P1. Текущая версия библиотеки отстает от актуальной документации
- В проекте зафиксировано `lightweight-charts@^4.2.3`.
- Файл: `package.json:26`
- Риск: команда ориентируется на актуальные tutorial'ы (v5), но API/паттерны в коде частично v4-специфичны; это тормозит развитие и усложняет поддержку.

### P1. Есть ошибка type-check в графическом коде
- Ошибка `TS2722` на вызове `series.setMarkers(...)`.
- Файл: `src/components/MiniQuoteChart.tsx:193`
- Подтверждено командой `npm run -s build:check`.
- Риск: strict TypeScript-сборка не проходит.

### P2. Неправильная модель отписки от crosshair-событий
- В коде сохраняется результат `subscribeCrosshairMove(...)` как будто это функция отписки.
- Фактически API использует парный вызов `unsubscribeCrosshairMove(handler)`.
- Файлы:
- `src/components/TradingChart.tsx:224`
- `src/components/TradingChart.tsx:250`
- `src/components/EquityChart.tsx:199`
- `src/components/EquityChart.tsx:227`
- Риск: хрупкий lifecycle и потенциальные утечки обработчиков при дальнейших рефакторингах.

### P2. Несогласованное преобразование времени между компонентами
- Часть графиков использует `toChartTimestamp(...)`, часть - `new Date(...).getTime()/1000`.
- Примеры:
- `src/components/TradingChart.tsx:385`
- `src/components/MultiTickerChart.tsx:86`
- `src/components/TradeDrawdownChart.tsx:89`
- `src/components/OpenDayDrawdownChart.tsx:39`
- `src/components/ProfitFactorAnalysis.tsx:63`
- `src/components/DurationAnalysis.tsx:97`
- Риск: смещения по дням/меткам на разных таймзонах, несинхронная визуализация между вкладками.

### P2. Массовое пересоздание chart-instance при обновлениях данных
- Несколько компонентов удаляют и создают chart заново при изменении массивов данных.
- Пример:
- `src/components/EquityChart.tsx:246` (зависимость эффекта от `equity` и `comparisonEquity`)
- `src/components/MultiTickerChart.tsx:337` (зависимость от `preparedTickersData`/`markersByTicker`)
- `src/components/TradeDrawdownChart.tsx:152`
- `src/components/ProfitFactorAnalysis.tsx:91`
- `src/components/DurationAnalysis.tsx:129`
- Риск: лишняя нагрузка, скачки UI, лишняя GC-активность на больших наборах данных.

### P2. Каждый график вешает собственный `window.resize` listener
- Файлы:
- `src/components/TradingChart.tsx:241`
- `src/components/EquityChart.tsx:218`
- `src/components/MultiTickerChart.tsx:306`
- `src/components/MiniQuoteChart.tsx:140`
- `src/components/TradeDrawdownChart.tsx:136`
- `src/components/OpenDayDrawdownChart.tsx:95`
- `src/components/ProfitFactorAnalysis.tsx:86`
- `src/components/DurationAnalysis.tsx:124`
- Риск: дублирование логики ресайза и деградация производительности на сложных экранах.

### P3. Неполное покрытие тестами именно chart-поведения
- `TradingChart` тестирует только факт рендера.
- Файл: `src/components/__tests__/TradingChart.test.tsx:6`
- Нет полноценной проверки поведения crosshair, маркеров, тайм-конверсии, cleanup, theme switch и resize.

## Аудит по страницам

### 1) `/results` (один тикер)
Сильные стороны:
- Богатый набор графиков для анализа стратегии.
- Есть тултипы, маркеры вход/выход, настройки индикаторов.

Проблемы:
- В `TradingChart` индикаторы IBS и Volume взаимоисключающие (`showIBS` vs `showVolume`), что ограничивает анализ свечей+объема.
- В `EquityChart` и аналитических графиках частое пересоздание chart-instance.
- Непоследовательная дата-модель между вкладками.

Рекомендации:
- Перейти на единый конвертер времени (`toChartTimestamp`) для всех chart-компонентов.
- Для realtime-обновлений котировок использовать `series.update(...)`, а не полную замену данных.
- Добавить диапазоны (`1M/3M/6M/YTD/1Y/ALL`) и сохранение выбранного диапазона в URL/сторе.

### 2) `/multi-ticker`
Сильные стороны:
- Есть обзорный мульти-график и карточки по каждому тикеру.

Проблемы:
- `MultiTickerChart` при росте числа тикеров становится визуально перегруженным.
- DOM-оверлеи с лейблами в самом контейнере усложняют lifecycle.
- При каждом крупном обновлении данных chart пересоздается.

Рекомендации:
- Добавить ограничение на число одновременно отображаемых тикеров + пагинацию/чекбоксы выбора.
- Сделать альтернативный режим сравнения: normalized line chart (база 100).
- Вынести легенду в React UI, не рисовать DOM-лейблы поверх графика вручную.

### 3) `/multi-ticker-options`
Проблемы и риски аналогичны `/multi-ticker`, поскольку используется тот же слой визуализации (`BacktestResultsView`).

Рекомендации:
- Переиспользовать единый chart-core слой и общие утилиты дат/resize/lifecycle.
- Сфокусироваться на одинаковом UX между multi и options, чтобы избежать расхождений поведения.

## Варианты улучшений

### Вариант A: Быстрая стабилизация (2-4 дня)
- Исправить type-check ошибки (`MiniQuoteChart`, смежные TS-ошибки).
- Привести подписки на crosshair к корректной схеме `subscribe/unsubscribe`.
- Унифицировать time conversion во всех графиках.
- Добавить smoke-тесты на ключевые chart-компоненты.

### Вариант B: Производительность + UX (1 спринт)
- Убрать массовое пересоздание chart при апдейтах данных (инициализация один раз, далее `setData/update/applyOptions`).
- Централизовать resize (общий hook + `ResizeObserver`/`autoSize`).
- Добавить range-switcher и улучшить мульти-тикерный UX (нормализация, фильтры, лимиты).

### Вариант C: Плановая миграция на v5 (1-2 спринта)
- Обновить библиотеку до v5.
- Перевести код на актуальный API добавления серий/маркеров.
- Использовать новые возможности v5 (в т.ч. более чистая архитектура серий/панелей) и убрать v4-технический долг.

## Рекомендованный порядок
1. Сначала Вариант A (устранить блокеры качества/сборки).
2. Затем Вариант B (ускорить UI и улучшить аналитику для пользователя).
3. После стабилизации - Вариант C (миграция на v5 как отдельная управляемая задача).
