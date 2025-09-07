// Отладка логики исполнения входа

console.log('=== ОТЛАДКА ЛОГИКИ ИСПОЛНЕНИЯ ВХОДА ===\n');

const testData = {
  ticker: 'AAPL',
  entryDate: '01.11.1999',
  exitDate: '05.11.1999',
  entryPrice: 0.69, // Это может быть цена закрытия дня входа
  exitPrice: 0.79,
  quantity: 3607,
  expectedPnL: 344.06,
  expectedPnLPercent: 13.76
};

console.log(`Тест сделки: ${testData.ticker}`);
console.log(`Дата входа: ${testData.entryDate}`);
console.log(`Дата выхода: ${testData.exitDate}`);

// Проверим разные варианты цены входа
const entryScenarios = [
  { name: 'Цена закрытия дня входа', price: 0.69 },
  { name: 'Цена открытия следующего дня', price: 0.70 }, // Предполагаем небольшой гэп
  { name: 'Цена открытия следующего дня +1%', price: 0.697 },
  { name: 'Цена открытия следующего дня -1%', price: 0.693 }
];

entryScenarios.forEach(scenario => {
  console.log(`\n--- ${scenario.name}: $${scenario.price} ---`);
  
  const notional = testData.quantity * scenario.price;
  const baseToUse = 2488.83; // Используем точную номинальную стоимость
  const marginFactor = notional / baseToUse;
  
  console.log(`- Номинальная стоимость: $${notional.toFixed(2)}`);
  console.log(`- База: $${baseToUse.toFixed(2)}`);
  console.log(`- Маржинальность: ${(marginFactor * 100).toFixed(1)}%`);
  
  // Расчет PnL
  const grossProceeds = testData.quantity * testData.exitPrice;
  const borrowed = notional - baseToUse;
  const netProceeds = grossProceeds - borrowed;
  const pnl = netProceeds - baseToUse;
  const pnlPercent = (pnl / baseToUse) * 100;
  
  console.log(`- Валовая выручка: $${grossProceeds.toFixed(2)}`);
  console.log(`- Заемные средства: $${borrowed.toFixed(2)}`);
  console.log(`- Чистая выручка: $${netProceeds.toFixed(2)}`);
  console.log(`- PnL: $${pnl.toFixed(2)}`);
  console.log(`- PnL %: ${pnlPercent.toFixed(2)}%`);
  
  // Проверяем совпадение
  const pnlDiff = Math.abs(pnl - testData.expectedPnL);
  const pnlPercentDiff = Math.abs(pnlPercent - testData.expectedPnLPercent);
  
  if (pnlDiff < 0.01 && pnlPercentDiff < 0.01) {
    console.log(`✅ ТОЧНОЕ СОВПАДЕНИЕ!`);
  } else {
    console.log(`❌ Разница: PnL ${pnlDiff.toFixed(2)}, PnL% ${pnlPercentDiff.toFixed(2)}%`);
  }
});

// Попробуем найти точную цену входа, которая даст нужный PnL
console.log(`\n=== ПОИСК ТОЧНОЙ ЦЕНЫ ВХОДА ===`);

const targetPnL = testData.expectedPnL;
const baseToUse = 2488.83;
const exitPrice = testData.exitPrice;
const quantity = testData.quantity;

// PnL = (quantity * exitPrice - borrowed) - baseToUse
// PnL = (quantity * exitPrice - (quantity * entryPrice - baseToUse)) - baseToUse
// PnL = quantity * exitPrice - quantity * entryPrice + baseToUse - baseToUse
// PnL = quantity * (exitPrice - entryPrice)
// entryPrice = exitPrice - (PnL / quantity)

const calculatedEntryPrice = exitPrice - (targetPnL / quantity);
console.log(`Расчетная цена входа: $${calculatedEntryPrice.toFixed(4)}`);

// Проверим эту цену
const notional = quantity * calculatedEntryPrice;
const borrowed = notional - baseToUse;
const grossProceeds = quantity * exitPrice;
const netProceeds = grossProceeds - borrowed;
const pnl = netProceeds - baseToUse;
const pnlPercent = (pnl / baseToUse) * 100;

console.log(`- Номинальная стоимость: $${notional.toFixed(2)}`);
console.log(`- Заемные средства: $${borrowed.toFixed(2)}`);
console.log(`- Валовая выручка: $${grossProceeds.toFixed(2)}`);
console.log(`- Чистая выручка: $${netProceeds.toFixed(2)}`);
console.log(`- PnL: $${pnl.toFixed(2)}`);
console.log(`- PnL %: ${pnlPercent.toFixed(2)}%`);

const pnlDiff = Math.abs(pnl - testData.expectedPnL);
const pnlPercentDiff = Math.abs(pnlPercent - testData.expectedPnLPercent);

if (pnlDiff < 0.01 && pnlPercentDiff < 0.01) {
  console.log(`✅ ТОЧНОЕ СОВПАДЕНИЕ!`);
} else {
  console.log(`❌ Разница: PnL ${pnlDiff.toFixed(2)}, PnL% ${pnlPercentDiff.toFixed(2)}%`);
}
