# Frontend Codebase Audit
*Date: 2026-03-21*

---

## AUDIT 1: Визуальные несоответствия

### 1. Метрики — два разных дизайна (HIGH)
`MetricsGrid` (используется на страницах акций/опционов) и `SimulationStatsGrid` (BuyAtClose, NoStopLoss) отображают одинаковые данные в разном визуальном стиле:
- MetricsGrid: `text-2xl font-bold`, карточки с `border p-4`, сетка `grid-cols-9`
- SimulationStatsGrid: `text-base font-semibold`, более компактный стиль `p-3`, сетка `grid-cols-5`

Пользователь видит разную "весомость" одних и тех же метрик в зависимости от вкладки.

---

### 2. Loading-заглушки при переключении вкладок — три разных варианта (MEDIUM)
- `SingleTickerPage`: `ResultsSectionLoader` — анимированный скелетон с `animate-pulse`, высота 192px
- `MultiTickerPage`: `ResultsPanelLoader` — простой текст "Загрузка аналитики..." без анимации, ~50px
- `MultiTickerOptionsPage`: копия `ResultsPanelLoader` из MultiTickerPage

Ощущение: на странице акции вкладки "загружаются" анимированно, на мульти-странице — просто текст.

---

### 3. Попап с описанием стратегии ("?") — не везде есть (MEDIUM)
- `MultiTickerPage`: есть кнопка "?" → попап `StrategyInfoCard`
- `MultiTickerOptionsPage`: есть кнопка "?" → попап `StrategyInfoCard`
- `SingleTickerPage`: нет кнопки "?" в панели параметров (там другой layout)

---

### 4. Попап настроек графика — разная иконка (LOW)
- `MultiTickerPage` / `MultiTickerOptionsPage`: `Settings2` из lucide-react
- `SingleTickerPage`: `Settings2` тоже, но кнопка встроена в другую структуру (toolbar над графиком)
- `TradingChart` (вкладка Цены): своя кнопка настроек EMA/сделок — полностью отдельный UX

---

### 5. Предупреждение "Данные не актуальны" — разный вид (LOW)
- `MultiTickerPage` / `MultiTickerOptionsPage`: жёлтый блок внутри правой панели с кнопкой refresh
- `SingleTickerPage`: реализовано внутри `useSingleTickerData`, отображается через другой механизм
- `BacktestResultsView` (вкладка Цены): своя refresh-кнопка в тулбаре TradingChart

---

### 6. Компактная сводка результатов в правой панели (MEDIUM)
- `MultiTickerPage` и `MultiTickerOptionsPage` показывают одинаковые метрики (CAGR, просадка, win rate, Sharpe, кол-во сделок) но сделаны через inline JSX, не через компонент
- Нет единого `CompactMetrics` компонента

---

### 7. Индикатор открытой позиции — есть только в 2 из 3 мест (LOW)
- `MultiTickerPage`: блок "Открытая сделка: да/нет" в правой панели
- `MultiTickerOptionsPage`: тот же блок (скопирован)
- `SingleTickerPage`: нет аналогичного блока в панели

---

## AUDIT 2: Дублирование кода

### 1. `getIsMarketOpen()` — 2 копии (CRITICAL)
**Файлы:**
- `MultiTickerPage.tsx` (lines 56–63)
- `MultiTickerOptionsPage.tsx` (lines 81–88)

Идентичная функция. В `SingleTickerPage` используется через хук. Нужно вынести в `src/lib/market-utils.ts`.

---

### 2. `lsGet()` — localStorage helper — 2 копии (CRITICAL)
**Файлы:**
- `MultiTickerPage.tsx` (lines 82–84)
- `MultiTickerOptionsPage.tsx` (lines 94–96)

Идентичный хелпер. Нужно вынести в `src/lib/storage.ts` или добавить в `src/lib/utils.ts`.

---

### 3. Outside-click detection pattern — 9+ копий (CRITICAL)
**Файлы:**
- `SingleTickerPage.tsx` — 2 попапа (quote details + hero settings)
- `MultiTickerPage.tsx` — 3 попапа (strategy info, quote details, hero settings)
- `MultiTickerOptionsPage.tsx` — 2 попапа (strategy info, hero settings)
- `DataEnhancer.tsx`
- `TradingChart.tsx` (chart settings)
- `ErrorConsole.tsx`

Везде одна и та же конструкция `useEffect` с `mousedown`. Нужен хук `useClickOutside(ref, isOpen, onClose)`.

---

### 4. `ResultsPanelLoader` / `ResultsSectionLoader` — 3 копии (HIGH)
**Файлы:**
- `SingleTickerPage.tsx` (`ResultsSectionLoader` — скелетон с `animate-pulse`)
- `MultiTickerPage.tsx` (`ResultsPanelLoader` — простой текст)
- `MultiTickerOptionsPage.tsx` (`ResultsPanelLoader` — копия MultiTickerPage)

Нужен единый компонент `ui/TabContentLoader.tsx`.

---

### 5. `getDefaultTickers()` — 2 копии (HIGH)
**Файлы:**
- `MultiTickerPage.tsx` (lines 70–73)
- `MultiTickerOptionsPage.tsx` (lines 98–101)

Идентичная логика. Можно вынести в хелпер или в стор.

---

### 6. `BacktestResults` interface — 3–4 копии (HIGH)
**Файлы:**
- `MultiTickerPage.tsx` (lines 38–44)
- `MultiTickerOptionsPage.tsx` (lines 63–69)
- `BacktestResultsView.tsx` — похожий тип `BacktestResultsData` с `metrics: any`

Нужно единое определение в `src/types/index.ts`.

---

### 7. `ChartQuote` type — 2 копии (MEDIUM)
**Файлы:**
- `MultiTickerPage.tsx` (line 46)
- `MultiTickerOptionsPage.tsx` (line 71)

Идентичный тип. Нужно в `src/types/index.ts`.

---

### 8. Quote-fetching useEffect (DatasetAPI.getQuote) — 3+ копии (MEDIUM)
**Файлы:**
- `MultiTickerPage.tsx`
- `MultiTickerOptionsPage.tsx`
- `useSingleTickerData.ts` (hook)

Почти идентичные useEffect с setChartQuoteLoading, fetchQuote, setInterval(60000), cancelled flag. Кандидат для хука `useTickerQuote(ticker, provider)`.

---

### 9. `prefetchAnalysisTab()` функция — 3 копии (MEDIUM)
**Файлы:**
- `SingleTickerPage.tsx` (lines 199–210) — полная версия с branch per tabId
- `MultiTickerPage.tsx` (lines 149–161) — похожая
- `MultiTickerOptionsPage.tsx` (lines 157–161) — самая простая

---

### 10. Strategy initialization pattern — 3 копии (MEDIUM)
**Файлы:**
- `MultiTickerPage.tsx` (lines 176–188)
- `MultiTickerOptionsPage.tsx` (lines 175–187)
- `SingleTickerPage.tsx` — через хук, но выражение похожее

```typescript
const activeStrategy = currentStrategy ?? fallbackStrategyRef.current;
const lowIBS = Number(activeStrategy?.parameters?.lowIBS ?? 0.1);
const highIBS = Number(activeStrategy?.parameters?.highIBS ?? 0.75);
const maxHoldDays = ...
```

---

### 11. Compact metrics display JSX — 2 копии (MEDIUM)
**Файлы:**
- `MultiTickerPage.tsx` (lines 703–723) — CAGR, просадка, win rate, Sharpe, сделки
- `MultiTickerOptionsPage.tsx` (lines ~305–325) — идентичный блок

Нет выделенного компонента.

---

### 12. Stale data warning JSX — 2 копии (LOW)
**Файлы:**
- `MultiTickerPage.tsx` (lines 726–741) — жёлтый блок + refresh кнопка
- `MultiTickerOptionsPage.tsx` — копия

---

### 13. Open position indicator JSX — 2 копии (LOW)
**Файлы:**
- `MultiTickerPage.tsx` (lines 743–756)
- `MultiTickerOptionsPage.tsx` — копия

---

### 14. localStorage keys — без централизованной схемы (LOW)
- `MultiTickerPage.tsx`: 5 констант `LS_*` в начале файла
- `MultiTickerOptionsPage.tsx`: 5 констант `LS_*`
- `SingleTickerPage.tsx`: ключи строками через localStorage напрямую
- Нет единого файла-схемы хранилища

---

## Сводная таблица

| Проблема | Тип | Критичность | Кол-во файлов |
|----------|-----|-------------|----------------|
| Outside-click pattern | Pattern | CRITICAL | 9+ |
| getIsMarketOpen() | Function | CRITICAL | 2 |
| lsGet() | Function | CRITICAL | 2 |
| ResultsPanelLoader | Component | HIGH | 3 |
| BacktestResults interface | Type | HIGH | 3–4 |
| getDefaultTickers() | Function | HIGH | 2 |
| Compact metrics JSX | Component | MEDIUM | 2 |
| ChartQuote type | Type | MEDIUM | 2 |
| Quote-fetching useEffect | Pattern | MEDIUM | 3+ |
| prefetchAnalysisTab() | Function | MEDIUM | 3 |
| Strategy init pattern | Pattern | MEDIUM | 3 |
| Метрики: 2 дизайна | Visual | HIGH | 2 |
| Loading: 3 варианта | Visual | MEDIUM | 3 |
| Stale data warning JSX | Component | LOW | 2 |
| Open position indicator JSX | Component | LOW | 2 |
| localStorage keys | Constants | LOW | 2+ |

---

## Приоритеты для рефакторинга

**Фаза 1 — Critical (быстрые wins, разблокируют остальное):**
1. `useClickOutside` хук — убирает 50+ строк дублей в 9 местах
2. `getIsMarketOpen()` → `src/lib/market-utils.ts`
3. `lsGet()` → `src/lib/storage.ts`

**Фаза 2 — High:**
4. `BacktestResults` + `ChartQuote` → `src/types/index.ts`
5. `ResultsPanelLoader` → `src/components/ui/TabContentLoader.tsx`
6. `getDefaultTickers()` → вынести в utils или стор
7. Унифицировать MetricsGrid vs SimulationStatsGrid

**Фаза 3 — Medium:**
8. `useTickerQuote` хук (quote-fetching pattern)
9. `CompactMetrics` компонент (правая панель)
10. `prefetchAnalysisTab` — общая утилита
11. Strategy init → хелпер

**Фаза 4 — Low:**
12. Централизовать localStorage keys
13. `StaleDataWarning` компонент
14. `OpenPositionIndicator` компонент
