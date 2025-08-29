export function Footer() {
  return (
    <footer className="bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 mt-auto border-t border-gray-200 dark:border-slate-800" style={{ marginTop: '100px' }}>
      <div className="max-w-7xl mx-auto px-4 py-6 safe-area-pb">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">IBS: тестировщик стратегий</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Стратегия IBS (mean reversion)</div>
          </div>
        </div>
      </div>
    </footer>
  );
}