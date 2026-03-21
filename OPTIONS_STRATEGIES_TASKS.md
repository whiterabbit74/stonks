# Задачи: Новые опционные стратегии

Добавить три альтернативных стратегии на странице `/multi-ticker-options` в дополнение
к существующей OTM Call. Пользователь выбирает тип стратегии перед запуском бэктеста,
параметры подстраиваются под выбранный тип.

---

## Контекст архитектуры

```
MultiTickerOptionsPage.tsx
  → runSinglePositionBacktest()     # генерирует IBS-сигналы (stockTrades)
  → runMultiTickerOptionsBacktest() # конвертирует сигналы в опционные сделки
      → blackScholes()              # ценообразование (optionsMath.ts)
      → getExecutionPrice()         # округление по биржевым правилам
```

Текущий код: один путь выполнения — покупка OTM call (strikePct выше spot).
Цель: добавить ветвление по `strategyType` внутри `runMultiTickerOptionsBacktest`.

---

## Фаза 1 — Типы и математика

### Задача 1.1 — Расширить типы (`src/lib/optionsBacktest.ts`, `src/types/index.ts`)

Добавить union type стратегии и обновить интерфейсы:

```typescript
// Новый union type
export type OptionsStrategyType = 'otm_call' | 'itm_call' | 'short_put' | 'bull_call_spread';

// Обновить OptionsBacktestConfig
export interface OptionsBacktestConfig {
  strategyType: OptionsStrategyType;   // НОВОЕ (default: 'otm_call')
  strikePct: number;                   // смысл зависит от стратегии (см. ниже)
  volAdjPct: number;
  capitalPct: number;
  riskFreeRate?: number;
  expirationWeeks?: number;
  maxHoldingDays?: number;
  // Только для bull_call_spread:
  spreadWidthPct?: number;             // НОВОЕ: ширина спреда в % (default: 5)
}

// Обновить OptionTrade — добавить поля для short leg и типа стратегии
export interface OptionTrade extends Trade {
  strategyType: OptionsStrategyType;   // НОВОЕ
  optionType: 'call' | 'put' | 'spread';
  strike: number;
  expirationDate: string;
  impliedVolAtEntry: number;
  impliedVolAtExit: number;
  optionEntryPrice: number;
  optionExitPrice: number;
  contracts: number;
  // Для short_put и bull_call_spread:
  shortStrike?: number;                // НОВОЕ: страйк короткого лега
  shortLegEntryPrice?: number;         // НОВОЕ: цена контракта короткого лега при входе
  shortLegExitPrice?: number;          // НОВОЕ: цена контракта короткого лега при выходе
  maxProfit?: number;                  // НОВОЕ: макс. прибыль спреда (для spread)
  maxLoss?: number;                    // НОВОЕ: макс. убыток (для spread и short_put)
}
```

**Семантика `strikePct` по стратегиям:**
- `otm_call`:         strike = spot × (1 + strikePct/100)   — выше spot
- `itm_call`:         strike = spot × (1 - strikePct/100)   — ниже spot
- `short_put`:        strike = spot × (1 - strikePct/100)   — ниже spot (OTM put)
- `bull_call_spread`:
  - long leg:  strike = spot                                 — ATM (strikePct игнорируется)
  - short leg: strike = spot × (1 + spreadWidthPct/100)     — выше spot

---

### Задача 1.2 — Добавить вспомогательные функции (`src/lib/optionsMath.ts`)

```typescript
/**
 * Цена вертикального спреда (разница двух опционов)
 * Для bull call spread: long ATM call - short OTM call
 * Возвращает цену ДЕБЕТА (стоимость входа, положительное число)
 */
export function getSpreadEntryPrice(
  longLegPrice: number,
  shortLegPrice: number
): number {
  return Math.max(0, longLegPrice - shortLegPrice);
}

/**
 * Цена выхода из bull call spread
 * При экспирации = min(spot - longStrike, shortStrike - longStrike)
 * Ограничена шириной спреда сверху
 */
export function getSpreadExitPrice(
  spot: number,
  longStrike: number,
  shortStrike: number
): number {
  const spreadWidth = shortStrike - longStrike;
  const intrinsic = Math.max(0, spot - longStrike) - Math.max(0, spot - shortStrike);
  return Math.min(Math.max(0, intrinsic), spreadWidth);
}

/**
 * Дельта опциона (Black-Scholes)
 * Нужна для отображения в UI и валидации ITM-ness
 */
export function delta(
  type: 'call' | 'put',
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  if (T <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2.0) * T) / (sigma * Math.sqrt(T));
  return type === 'call' ? cnd(d1) : cnd(d1) - 1;
}
// Примечание: cnd() уже определена в файле, только переместить из локальной в экспортируемую
// или продублировать логику внутри delta()
```

---

## Фаза 2 — Движки бэктеста

### Задача 2.1 — Рефакторинг `runMultiTickerOptionsBacktest` (`src/lib/optionsBacktest.ts`)

Разбить монолитную функцию на:
1. **Оркестратор** `runMultiTickerOptionsBacktest` — маршрутизирует по `strategyType`
2. **Построитель входа** `buildEntryTrade(strategyType, stockTrade, marketData, config, r)` → `OptionTrade | null`
3. **Вычислитель mark-to-market** `getMarkToMarketPrice(trade, spot, T, vol, r)` → `number`
4. **Вычислитель выхода** `getExitPrice(trade, spot, T, vol, r, isExpired)` → `number`

Это изолирует логику каждой стратегии и облегчает тесты.

---

### Задача 2.2 — ITM Call стратегия

**Логика входа:**
```
strike = Math.round(spot × (1 - strikePct/100))
optionType = 'call'
T = expirationWeeks → следующая пятница
price = blackScholes('call', spot, strike, T, r, vol)
contracts = floor(capital × capitalPct/100 / contractPrice)
```

**Mark-to-market и выход:** аналогично текущему OTM call — `blackScholes('call', spot, strike, T, r, vol)`.

**При экспирации:** intrinsic = max(0, spot - strike). Для глубокого ITM это ≈ spot - strike.

**Ключевое отличие от OTM call:** strike НИЖЕ spot → delta ~0.7–0.8 → опцион дороже, меньше контрактов, но гораздо выше чувствительность к движению акции.

---

### Задача 2.3 — Short Put стратегия

**Смысл:** продаём OTM put при входе по IBS-сигналу, получаем премию сразу.
Прибыль = удержанная премия если акция остаётся выше страйка.
Убыток нарастает если акция падает ниже страйка.

**Логика входа:**
```
strike = Math.round(spot × (1 - strikePct/100))
optionType = 'put' (короткий)
T = expirationWeeks → следующая пятница
theoreticalPrice = blackScholes('put', spot, strike, T, r, vol)
contractPrice = getExecutionPrice(theoreticalPrice)
contracts = floor(capital × capitalPct/100 / contractPrice)

// Продаём — получаем премию (не тратим капитал)
currentCapital += contracts × contractPrice    // ПЛЮС, не минус!
// Но должны зарезервировать маржу:
marginRequired = contracts × strike × 100       // cash-secured
// Если cash-secured: нужно currentCapital >= marginRequired
// Упрощение для бэктеста: резервируем только часть
```

**Важно для бэктеста (упрощение):** моделируем cash-secured put.
Резервируем: `contracts × strike × 100` из капитала (как будто готовы купить акции).
При входе: `currentCapital -= marginRequired; currentCapital += premiumReceived`.

**Mark-to-market (обратный знак!):**
```
currentPutPrice = blackScholes('put', spot, strike, T, r, vol)
positionValue = -(contracts × contractPrice)  // мы продали, рост цены пута = убыток
portfolioValue = currentCapital + marginRequired + positionValue
```

**При выходе (откуп пута):**
```
buybackPrice = getExecutionPrice(blackScholes('put', spot, strike, T, r, vol))
// При экспирации: intrinsic = max(0, strike - spot)
pnl = (entryPrice - buybackPrice) × contracts
currentCapital += marginRequired - (contracts × buybackPrice)
```

**Поля OptionTrade для short_put:**
```typescript
optionType: 'put',
strategyType: 'short_put',
optionEntryPrice: premiumReceived,     // что получили при продаже
optionExitPrice: buybackPrice,         // что заплатили при откупе
maxLoss: strike × 100,                 // теоретический макс убыток на контракт
```

---

### Задача 2.4 — Bull Call Spread стратегия

**Смысл:** покупаем ATM call + продаём OTM call (выше spot).
Фиксированный риск = уплаченный дебет. Макс прибыль = ширина спреда - дебет.

**Логика входа:**
```
longStrike = Math.round(spot)                              // ATM
shortStrike = Math.round(spot × (1 + spreadWidthPct/100)) // OTM

longPrice  = blackScholes('call', spot, longStrike,  T, r, vol)
shortPrice = blackScholes('call', spot, shortStrike, T, r, vol)
netDebit   = getExecutionPrice(longPrice - shortPrice)     // цена входа в спред

spreadWidth = shortStrike - longStrike  // в пунктах
maxProfit   = spreadWidth × 100 - netDebit  // макс прибыль на контракт
maxLoss     = netDebit                      // макс убыток на контракт

contracts   = floor(capital × capitalPct/100 / netDebit)
currentCapital -= contracts × netDebit
```

**Mark-to-market:**
```
longVal  = blackScholes('call', spot, longStrike,  T, r, vol)
shortVal = blackScholes('call', spot, shortStrike, T, r, vol)
spreadMtm = getExecutionPrice(longVal - shortVal)
portfolioValue = currentCapital + contracts × spreadMtm
```

**При выходе:**
```
// По IBS-сигналу:
exitLong  = blackScholes('call', spot, longStrike,  T, r, vol)
exitShort = blackScholes('call', spot, shortStrike, T, r, vol)
exitSpreadPrice = getExecutionPrice(exitLong - exitShort)

// При экспирации: используем intrinsic
exitSpreadPrice = getSpreadExitPrice(spot, longStrike, shortStrike) * 100 // → contract price

pnl = (exitSpreadPrice - netDebit) × contracts
currentCapital += contracts × exitSpreadPrice
```

**Поля OptionTrade для bull_call_spread:**
```typescript
optionType: 'spread',
strategyType: 'bull_call_spread',
strike: longStrike,                  // длинный лег (основной)
shortStrike: shortStrike,            // короткий лег
optionEntryPrice: netDebit,          // уплаченный дебет
shortLegEntryPrice: shortContractPrice,
maxProfit: spreadWidth * 100 - netDebit,
maxLoss: netDebit,
```

---

## Фаза 3 — UI

### Задача 3.1 — Селектор стратегии (`src/components/MultiTickerOptionsPage.tsx`)

Добавить переключатель типа стратегии **над параметрами** в виде сегментированных кнопок (4 варианта):

```
[OTM Call] [ITM Call] [Short Put] [Bull Spread]
```

Каждая кнопка — таб с иконкой и кратким описанием при наведении (tooltip).

```typescript
const STRATEGY_OPTIONS = [
  {
    id: 'otm_call' as OptionsStrategyType,
    label: 'OTM Call',
    description: 'Покупка колла выше рынка. Высокий риск, высокий потенциал.'
  },
  {
    id: 'itm_call' as OptionsStrategyType,
    label: 'ITM Call',
    description: 'Покупка колла ниже рынка. Замена акции с плечом.'
  },
  {
    id: 'short_put' as OptionsStrategyType,
    label: 'Short Put',
    description: 'Продажа пута ниже рынка. Сбор премии при высокой IV.'
  },
  {
    id: 'bull_call_spread' as OptionsStrategyType,
    label: 'Bull Spread',
    description: 'Колл-спред. Фиксированный риск, нейтральная IV.'
  },
];

const [strategyType, setStrategyType] = useState<OptionsStrategyType>('otm_call');
```

---

### Задача 3.2 — Условные параметры по типу стратегии

Параметры меняются в зависимости от `strategyType`. Реализовать через conditional rendering внутри `StrategyConfigurationCard`:

**Общие для всех:**
- Тикеры
- Капитал на сделку (%)
- Экспирация (недели)
- Макс. удержание (дней)
- IV Adj (+%)

**otm_call:**
- Страйк: `+5% / +10% / +15% / +20%` (выше spot) — метка "Страйк (+%)"

**itm_call:**
- Страйк: `5% / 7% / 10% / 15%` (ниже spot) — метка "Страйк в деньги (%)"
- Убрать параметр экспирация (фиксировать 4-8 недель, theta не критична для deep ITM)
  или оставить как есть

**short_put:**
- Страйк: `3% / 5% / 7% / 10%` (ниже spot) — метка "Страйк пута (-%)"
- Убрать IV Adj (для short стратегии IV adjustment работает против нас — не путать пользователя)
- Добавить инфо-блок: "Стратегия требует маржевого счёта. Моделируется как cash-secured."

**bull_call_spread:**
- Убрать "Страйк (+%)" — long всегда ATM
- Добавить "Ширина спреда (%)": `2% / 3% / 5% / 7% / 10%` — метка "Ширина спреда"
- IV Adj оставить

---

### Задача 3.3 — Колонки в таблице сделок

Таблица сделок уже существует в `TradesTable.tsx` / `BacktestResultsView.tsx`.
Добавить условные колонки для опционных сделок при `mode = 'options'`:

| Стратегия      | Дополнительные колонки                        |
|----------------|-----------------------------------------------|
| otm_call       | Страйк, Экспирация, IV вход, IV выход, Контракты |
| itm_call       | Страйк, Δ входа (delta), Экспирация, Контракты   |
| short_put      | Страйк пута, Полученная премия, Откуп, Контракты |
| bull_call_spread| Long страйк, Short страйк, Дебет, Макс прибыль, Контракты |

Реализация: проверять `trade.strategyType` в рендере строки таблицы.

---

### Задача 3.4 — Badge с типом стратегии в заголовке результатов

После запуска бэктеста добавить цветной badge рядом с заголовком MetricsGrid,
показывающий какая стратегия была использована:
- OTM Call → синий
- ITM Call → фиолетовый
- Short Put → оранжевый
- Bull Spread → зелёный

---

## Фаза 4 — Тесты

### Задача 4.1 — Тест ITM Call (`src/lib/__tests__/itmCallBacktest.test.ts`)

```typescript
// Проверить:
// 1. Strike = round(spot * 0.9) когда strikePct=10
// 2. Delta ITM call > 0.6 (проверить через delta() из optionsMath)
// 3. P&L при росте акции на 2% > P&L OTM call при тех же условиях
// 4. При экспирации: exitPrice = max(0, spot - strike) * 100
```

### Задача 4.2 — Тест Short Put (`src/lib/__tests__/shortPutBacktest.test.ts`)

```typescript
// Проверить:
// 1. При входе currentCapital увеличивается на premiumReceived
// 2. При росте акции (IBS-сигнал выхода): pnl > 0 (premium частично удержан)
// 3. При экспирации выше страйка: pnl = полная премия (опцион истёк worthless)
// 4. При экспирации ниже страйка: убыток = (strike - spot) * contracts * 100
// 5. Проверить portfolioValue mark-to-market корректен (обратный знак)
```

### Задача 4.3 — Тест Bull Call Spread (`src/lib/__tests__/bullCallSpreadBacktest.test.ts`)

```typescript
// Проверить:
// 1. netDebit = longLegPrice - shortLegPrice (положительный)
// 2. maxProfit = (shortStrike - longStrike) * 100 - netDebit
// 3. При экспирации между страйками: exitPrice = (spot - longStrike) * 100
// 4. При экспирации выше shortStrike: exitPrice = (shortStrike - longStrike) * 100
// 5. При экспирации ниже longStrike: exitPrice = 0, pnl = -netDebit * contracts
// 6. IV collapse (vol падение 20%): спред теряет меньше чем naked call
```

### Задача 4.4 — Тест getSpreadExitPrice (`src/lib/__tests__/optionsMath.test.ts`)

Добавить кейсы в существующий файл:
```typescript
// getSpreadExitPrice(110, 100, 105) = 5 (выше shortStrike → max profit)
// getSpreadExitPrice(103, 100, 105) = 3 (между страйками)
// getSpreadExitPrice(98,  100, 105) = 0 (ниже longStrike → worthless)
```

---

## Порядок выполнения

```
1.1 Типы → 1.2 optionsMath helpers
2.1 Рефакторинг оркестратора → 2.2 ITM Call → 2.3 Short Put → 2.4 Bull Spread
3.1 Селектор UI → 3.2 Условные параметры → 3.3 Таблица → 3.4 Badge
4.1–4.4 Тесты (можно писать параллельно с Фазой 2)
```

---

## Файлы к изменению / созданию

| Файл | Действие |
|------|----------|
| `src/lib/optionsBacktest.ts` | Рефакторинг + 3 новые стратегии |
| `src/lib/optionsMath.ts` | Добавить `getSpreadEntryPrice`, `getSpreadExitPrice`, `delta` |
| `src/components/MultiTickerOptionsPage.tsx` | Селектор + условные параметры |
| `src/lib/__tests__/itmCallBacktest.test.ts` | Новый файл |
| `src/lib/__tests__/shortPutBacktest.test.ts` | Новый файл |
| `src/lib/__tests__/bullCallSpreadBacktest.test.ts` | Новый файл |
| `src/lib/__tests__/optionsMath.test.ts` | Дополнить |

---

## Открытые вопросы

1. **Short Put маржа:** моделировать как cash-secured (проще, реалистично для небольших счётов)
   или как naked put с маржой 20% от notional? → рекомендую cash-secured для первой версии.

2. **Bull Spread — long strike:** всегда ATM (strikePct=0) или позволить пользователю сдвигать?
   → ATM как default, опционально расширить потом.

3. **Общий initialCapital:** сейчас хардкод $10,000. Вынести в параметр страницы?

4. **Short Put — exit по IBS-сигналу:** откупаем пут когда IBS говорит "exit акцию"?
   Это корректно (логика симметрична). Но можно добавить альтернативу: держать до 50% прибыли.
