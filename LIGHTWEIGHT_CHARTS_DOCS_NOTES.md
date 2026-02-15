# Lightweight Charts: ключевая выжимка документации

Дата обзора: 2026-02-14

## Источники
- Официальные tutorial'ы: <https://tradingview.github.io/lightweight-charts/tutorials>
- API/Docs: <https://tradingview.github.io/lightweight-charts/docs>
- Миграция v4->v5: <https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5>
- What is new in v5: <https://tradingview.github.io/lightweight-charts/docs/release-notes#whats-new-in-50>
- GitHub репозиторий: <https://github.com/tradingview/lightweight-charts>
- README (raw): <https://raw.githubusercontent.com/tradingview/lightweight-charts/master/README.md>

## 1. Базовая модель библиотеки
- Chart создается через `createChart(container, options)`.
- Основная работа с данными идет через series (`Candlestick`, `Line`, `Area`, `Histogram`, `Baseline`).
- Серии принимают `setData([...])` для полной загрузки и `update(point)` для инкрементальных real-time апдейтов.
- Взаимодействие (hover/tooltip/legend) строится через подписки типа `subscribeCrosshairMove(handler)`.

## 2. Важные практики из tutorial'ов
- Разделение цены и объема: делать volume отдельной `Histogram`-серией, обычно с `priceScaleId: ''` и `scaleMargins`, чтобы цена и объем не мешали друг другу.
- Tooltips/Legend: обновлять UI по `subscribeCrosshairMove`, держать tooltip `pointer-events: none`, скрывать при выходе курсора/пустых данных.
- Две шкалы цен: использовать `leftPriceScale`/`rightPriceScale` и `priceScaleId` для разных серий.
- Синхронизация графиков: использовать `setCrosshairPosition`/`clearCrosshairPosition` и синхронизацию диапазона по `timeScale()`.
- Realtime: при добавлении новых баров использовать `series.update(...)` вместо полного `setData(...)`.
- Infinite history/lazy-load: реагировать на `subscribeVisibleLogicalRangeChange`, подгружать историю при приближении к левому краю диапазона.
- Кастомизация локали/форматирования: через `localization`, `priceFormat`, `timeScale` форматтеры.

## 3. React-интеграция (из tutorial'ов)
- Хранить chart/series в `useRef`.
- Инициализировать chart в `useEffect` после монтирования контейнера.
- В cleanup обязательно делать отписки и `chart.remove()`.
- На ресайз корректно обновлять размеры chart (предпочтительно через `ResizeObserver`/`autoSize`, а не только через `window.resize`).

## 4. Производительность и стабильность
- Для live-режимов минимизировать полные перерисовки (`setData`) и переходить к `update`.
- Держать единый формат времени (UTC timestamp или business day) без смешивания разных преобразований по коду.
- Передавать уже валидированные/отсортированные данные, чтобы не сортировать на каждом рендере.
- Убирать лишние DOM-оверлеи поверх canvas, где возможно (или строго контролировать их lifecycle).

## 5. Что важно по версиям (v4 vs v5)
- В v5 введен более унифицированный API добавления серий (`addSeries(...)`), улучшена tree-shaking модель и появились новые возможности.
- В v5 есть изменения в API маркеров/кастомных серий, которые нужно учитывать при миграции с v4.
- Практически: если кодовая база на v4, а команда ориентируется на текущие tutorial'ы v5, лучше планово мигрировать, чтобы не копить несовместимые паттерны.

## 6. Ограничения и лицензирование
- Проект open-source (Apache-2.0), но README отдельно напоминает про ограничения использования торговых марок TradingView.
- Перед публичным коммерческим использованием UI/branding стоит проверить актуальные условия из README/NOTICE.

## 7. Мини-чеклист для команды
- Используем ли везде единый конвертер даты для графиков?
- Где можно заменить `setData` на `update`?
- Везде ли корректный cleanup подписок?
- Нет ли массового пересоздания chart при каждом изменении данных?
- Готов ли слой графиков к переходу на v5 API?
