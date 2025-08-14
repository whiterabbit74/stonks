import { Play, CheckCircle, ArrowRight } from 'lucide-react';
import { useAppStore } from '../stores';

interface BacktestRunnerProps {
  onNext?: () => void;
}

export function BacktestRunner({ onNext }: BacktestRunnerProps) {
  const { backtestResults, backtestStatus, runBacktest } = useAppStore();

  const handleRunBacktest = async () => {
    try {
      await runBacktest();
    } catch (error) {
      console.error('Бэктест завершился ошибкой:', error);
    }
  };

  if (backtestResults) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Бэктест завершён
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {backtestResults.metrics.totalReturn.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Суммарная доходность</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {backtestResults.trades.length}
            </div>
            <div className="text-sm text-gray-600">Количество сделок</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {backtestResults.metrics.winRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Доля прибыльных</div>
          </div>
        </div>
        <div className="space-y-4">
          <button
            onClick={handleRunBacktest}
            disabled={backtestStatus === 'running'}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Запустить ещё раз
          </button>
          
          {onNext && (
            <div>
              <button
                onClick={onNext}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Дальше
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Запустить бэктест
        </h2>
        <p className="text-gray-600">
          Прогон стратегии на исторических данных
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4">
          Готово к бэктесту
        </h3>
        <p className="text-gray-600 mb-6">
          Данные и стратегия настроены. Нажмите кнопку ниже, чтобы запустить бэктест.
        </p>
        
        <button
          onClick={handleRunBacktest}
          disabled={backtestStatus === 'running'}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
            backtestStatus === 'running'
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {backtestStatus === 'running' ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Выполняется…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Запустить бэктест
            </>
          )}
        </button>

        {backtestStatus === 'running' && (
          <p className="text-sm text-gray-500 mt-2">
            Обычно занимает несколько секунд…
          </p>
        )}
      </div>
    </div>
  );
}