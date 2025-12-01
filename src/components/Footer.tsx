import { Logo } from './Logo';
import { ErrorLogButton } from './ErrorLogButton';

interface FooterProps {
  apiBuildId?: string | null;
}

export function Footer({ apiBuildId }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Основная информация */}
          <div className="space-y-4">
            <Logo size="md" />
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Анализ и тестирование торговых стратегий на исторических данных.
              Специализация на стратегиях mean reversion и техническом анализе.
            </p>
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
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                © {currentYear} IBS Trading Strategy. Все права защищены.
              </div>
              <ErrorLogButton />
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