import { readFileSync } from 'fs';
import { CleanBacktestEngine } from './src/lib/clean-backtest.ts';
import { adjustOHLCForSplits } from './src/lib/utils.ts';

// Загружаем реальные данные GOOGL
const googlData = JSON.parse(readFileSync('./src/data/GOOGL.json', 'utf8'));

// Преобразуем даты в объекты Date
const processedData = googlData.data.map(bar => ({
  ...bar,
  date: new Date(bar.date)
}));

// Известные сплиты GOOGL
const googlSplits = [
  { date: '2022-07-15', factor: 20 }, // 20:1 split
  { date: '2014-04-02', factor: 2 }   // 2:1 split
];

console.log('🔍 ТЕСТИРОВАНИЕ ИСПРАВЛЕНИЯ СПЛИТОВ');
console.log(`📊 Исходных данных: ${processedData.length} дней`);

// Применяем сплиты к данным
const adjustedData = adjustOHLCForSplits(processedData, googlSplits);

console.log(`📊 После обработки сплитов: ${adjustedData.length} дней`);

// Проверяем цены до и после сплита
const beforeSplit = adjustedData.find(bar => 
  bar.date.toISOString().split('T')[0] === '2022-07-14'
);
const afterSplit = adjustedData.find(bar => 
  bar.date.toISOString().split('T')[0] === '2022-07-15'
);

if (beforeSplit && afterSplit) {
  console.log('\n📈 ПРОВЕРКА СПЛИТА 2022-07-15:');
  console.log(`До сплита (14.07): Close = $${beforeSplit.close.toFixed(2)}`);
  console.log(`После сплита (15.07): Close = $${afterSplit.close.toFixed(2)}`);
  console.log(`Ожидаемое соотношение: ${(beforeSplit.close / afterSplit.close).toFixed(1)}:1`);
}

// Создаем стратегию
const strategy = {
  parameters: {
    lowIBS: 0.1,
    highIBS: 0.75,
    maxHoldDays: 30
  },
  riskManagement: {
    initialCapital: 10000,
    capitalUsagePercent: 100
  }
};

// Запускаем бэктест на исправленных данных
const engine = new CleanBacktestEngine(adjustedData, strategy, {
  entryExecution: 'close',
  ignoreMaxHoldDaysExit: false,
  ibsExitRequireAboveEntry: false
});

const result = engine.runBacktest();

console.log('\n📈 РЕЗУЛЬТАТЫ НА ИСПРАВЛЕННЫХ ДАННЫХ:');
console.log(`💰 Финальный капитал: $${result.equity[result.equity.length - 1]?.value.toFixed(2) || 'N/A'}`);
console.log(`📊 Всего сделок: ${result.trades.length}`);

// Проверяем проблемные сделки
const problematicTrades = result.trades.filter(trade => 
  Math.abs(trade.pnl) > 10000 || // Слишком большой абсолютный PnL
  trade.entryPrice < 1 || trade.entryPrice > 1000 || // Нереальные цены
  trade.quantity > 1000 // Слишком много акций
);

console.log(`\n🚨 Проблемных сделок: ${problematicTrades.length}`);

if (problematicTrades.length > 0) {
  console.log('\n❌ ПРОБЛЕМНЫЕ СДЕЛКИ:');
  problematicTrades.slice(0, 5).forEach((trade, i) => {
    console.log(`\n${i + 1}. ${trade.entryDate.toISOString().split('T')[0]} - ${trade.exitDate.toISOString().split('T')[0]}`);
    console.log(`   Вход: $${trade.entryPrice.toFixed(2)}, Выход: $${trade.exitPrice.toFixed(2)}`);
    console.log(`   Количество: ${trade.quantity}, PnL: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);
  });
} else {
  console.log('✅ Проблемных сделок не найдено!');
}

// Проверяем equity curve
const equityPoints = result.equity;
if (equityPoints.length > 0) {
  const startValue = equityPoints[0].value;
  const endValue = equityPoints[equityPoints.length - 1].value;
  const totalReturn = ((endValue - startValue) / startValue) * 100;
  
  console.log(`\n📊 АНАЛИЗ EQUITY CURVE:`);
  console.log(`💰 Начальный капитал: $${startValue.toFixed(2)}`);
  console.log(`💰 Финальный капитал: $${endValue.toFixed(2)}`);
  console.log(`📈 Общая доходность: ${totalReturn.toFixed(2)}%`);
}
