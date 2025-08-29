interface FooterProps {
  apiBuildId?: string | null;
}

export function Footer({ apiBuildId }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Основная информация */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/30">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">IBS Trading Strategies</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Профессиональный тестировщик стратегий</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Анализ и тестирование торговых стратегий на исторических данных.
              Специализация на стратегиях mean reversion и техническом анализе.
            </p>
          </div>

          {/* Навигация */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
              Навигация
            </h4>
            <nav className="grid grid-cols-2 gap-2">
              <a href="/data" className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors">
                Данные
              </a>
              <a href="/results" className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors">
                Результаты
              </a>
              <a href="/calendar" className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors">
                Календарь
              </a>
              <a href="/settings" className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors">
                Настройки
              </a>
            </nav>
          </div>

          {/* Техническая информация */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
              Система
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Версия API:</span>
                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {apiBuildId || 'dev'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Статус:</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-200">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  Online
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Нижняя часть футера */}
        <div className="border-t border-gray-200 dark:border-gray-800 mt-8 pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              © {currentYear} IBS Trading Strategies. Все права защищены.
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
              <span>Powered by React & TypeScript</span>
              <span>•</span>
              <span>Built with ❤️ for traders</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}