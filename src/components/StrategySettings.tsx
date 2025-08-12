import { useState } from 'react';
import { X, Save, RotateCcw, Bell } from 'lucide-react';
import type { Strategy } from '../types';
import { createDefaultStrategy } from '../lib/strategy';
import { useAppStore } from '../stores';
import { DatasetAPI } from '../lib/api';

interface StrategySettingsProps {
  strategy: Strategy;
  onSave: (updatedStrategy: Strategy) => void;
  onClose: () => void;
}

export function StrategySettings({ strategy, onSave, onClose }: StrategySettingsProps) {
  const [editedStrategy, setEditedStrategy] = useState<Strategy>({ ...strategy });
  const { watchThresholdPct, setWatchThresholdPct, resultsQuoteProvider, resultsRefreshProvider, enhancerProvider, setResultsQuoteProvider, setResultsRefreshProvider, setEnhancerProvider } = useAppStore();
  const [testMsg, setTestMsg] = useState('Проверка уведомлений из приложения ✅');
  const [sendingTest, setSendingTest] = useState(false);

  const handleParameterChange = (key: string, value: number) => {
    setEditedStrategy(prev => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [key]: value
      }
    }));
  };

  const handleRiskManagementChange = (key: string, value: number | boolean) => {
    setEditedStrategy(prev => ({
      ...prev,
      riskManagement: {
        ...prev.riskManagement,
        [key]: value
      }
    }));
  };

  const handleSave = async () => {
    onSave(editedStrategy);
    try { await useAppStore.getState().saveSettingsToServer(); } catch { /* ignore */ }
    onClose();
  };

  const handleReset = () => {
    const defaults = createDefaultStrategy();
    setEditedStrategy({
      id: strategy.id,
      name: defaults.name || strategy.name,
      description: defaults.description || strategy.description,
      parameters: defaults.parameters || strategy.parameters,
      entryConditions: defaults.entryConditions || strategy.entryConditions,
      exitConditions: defaults.exitConditions || strategy.exitConditions,
      riskManagement: (defaults.riskManagement || strategy.riskManagement) as Strategy['riskManagement'],
      positionSizing: (defaults.positionSizing || strategy.positionSizing) as Strategy['positionSizing'],
      type: strategy.type,
    });
  };

  const getParameterConfig = (strategyId: string) => {
    const configs: Record<string, Record<string, { label: string; min: number; max: number; step?: number; description?: string }>> = {
      'ibs-mean-reversion': {
        lowIBS: { 
          label: 'Low IBS Entry Threshold', 
          min: 0.01, 
          max: 0.5, 
          step: 0.01, 
          description: 'Enter long position when IBS < this value (close near daily low). Default: 0.1' 
        },
        highIBS: { 
          label: 'High IBS Exit Threshold', 
          min: 0.5, 
          max: 0.99, 
          step: 0.01, 
          description: 'Exit position when IBS > this value (close near daily high). Default: 0.75' 
        },
        maxHoldDays: { 
          label: 'Maximum Hold Days', 
          min: 1, 
          max: 365, 
          description: 'Force exit after this many days if IBS exit condition not met. Default: 30' 
        }
      }
    } as const;
    
    return configs[strategyId] || {};
  };

  const parameterConfig = getParameterConfig(strategy.id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Параметры стратегии</h2>
            <p className="text-sm text-gray-600 mt-1">{strategy.name}</p>
            {strategy.id === 'ibs-mean-reversion' && (
              <p className="text-xs text-blue-600 mt-1">
                IBS = (Close - Low) / (High - Low) • Measures where close is within daily range
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Strategy Parameters */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Параметры стратегии</h3>
            <div className="space-y-4">
              {Object.entries(parameterConfig).map(([key, config]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {config.label}
                  </label>
                  {config.description && (
                    <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                  )}
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={config.min}
                      max={config.max}
                      step={config.step || 1}
                      value={editedStrategy.parameters[key] as number || config.min}
                      onChange={(e) => handleParameterChange(key, Number(e.target.value))}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      min={config.min}
                      max={config.max}
                      step={config.step || 1}
                      value={editedStrategy.parameters[key] as number || config.min}
                      onChange={(e) => handleParameterChange(key, Number(e.target.value))}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Риск‑менеджмент</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                   Начальный капитал ($)
                </label>
                <input
                  type="number"
                  min={1000}
                  max={1000000}
                  step={1000}
                  value={editedStrategy.riskManagement.initialCapital}
                  onChange={(e) => handleRiskManagementChange('initialCapital', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                   Использование капитала (%)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Процент депозита, используемый в каждой сделке. 100% = весь доступный капитал
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={editedStrategy.riskManagement.capitalUsage}
                    onChange={(e) => handleRiskManagementChange('capitalUsage', Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editedStrategy.riskManagement.capitalUsage}
                    onChange={(e) => handleRiskManagementChange('capitalUsage', Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                     Стоп‑лосс (%)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editedStrategy.riskManagement.useStopLoss}
                      onChange={(e) => handleRiskManagementChange('useStopLoss', e.target.checked)}
                    />
                    Использовать
                  </label>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={(editedStrategy.riskManagement.stopLoss ?? 0)}
                    onChange={(e) => handleRiskManagementChange('stopLoss', Number(e.target.value))}
                    className="flex-1"
                    disabled={!editedStrategy.riskManagement.useStopLoss}
                  />
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={(editedStrategy.riskManagement.stopLoss ?? 0)}
                    onChange={(e) => handleRiskManagementChange('stopLoss', Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    disabled={!editedStrategy.riskManagement.useStopLoss}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                     Тейк‑профит (%)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editedStrategy.riskManagement.useTakeProfit}
                      onChange={(e) => handleRiskManagementChange('useTakeProfit', e.target.checked)}
                    />
                    Использовать
                  </label>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={(editedStrategy.riskManagement.takeProfit ?? 0)}
                    onChange={(e) => handleRiskManagementChange('takeProfit', Number(e.target.value))}
                    className="flex-1"
                    disabled={!editedStrategy.riskManagement.useTakeProfit}
                  />
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={(editedStrategy.riskManagement.takeProfit ?? 0)}
                    onChange={(e) => handleRiskManagementChange('takeProfit', Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    disabled={!editedStrategy.riskManagement.useTakeProfit}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications & Providers */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2"><Bell className="w-4 h-4" /> Уведомления и провайдеры</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Граница близости к IBS-цели для уведомления (%)</label>
                <p className="text-xs text-gray-500 mb-2">Диапазон 0–20%. По умолчанию 5%.</p>
                <div className="flex items-center gap-4">
                  <input type="range" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=>setWatchThresholdPct(Number(e.target.value))} className="flex-1" />
                  <input type="number" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=>setWatchThresholdPct(Number(e.target.value))} className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2">Тест сообщения в Telegram</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={testMsg} onChange={(e)=>setTestMsg(e.target.value)} className="flex-1 min-w-[260px] px-3 py-2 rounded-md border" />
                  <button onClick={async ()=>{ setSendingTest(true); try { await DatasetAPI.sendTelegramTest(testMsg); } finally { setSendingTest(false);} }} disabled={sendingTest} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
                    {sendingTest ? 'Отправка…' : 'Отправить тест'}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-white">
                <div className="text-sm font-medium text-gray-900 mb-3">Провайдеры данных</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Котировки на странице результатов</label>
                    <div className="flex gap-2">
                      <button onClick={()=>setResultsQuoteProvider('finnhub')} className={`px-3 py-1 rounded text-sm ${resultsQuoteProvider==='finnhub'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Finnhub</button>
                      <button onClick={()=>setResultsQuoteProvider('alpha_vantage')} className={`px-3 py-1 rounded text-sm ${resultsQuoteProvider==='alpha_vantage'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Alpha Vantage</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Кнопка «Актуализировать данные» (результаты)</label>
                    <div className="flex gap-2">
                      <button onClick={()=>setResultsRefreshProvider('finnhub')} className={`px-3 py-1 rounded text-sm ${resultsRefreshProvider==='finnhub'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Finnhub</button>
                      <button onClick={()=>setResultsRefreshProvider('alpha_vantage')} className={`px-3 py-1 rounded text-sm ${resultsRefreshProvider==='alpha_vantage'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Alpha Vantage</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Загрузка/дополнение данных (вкладка Доп. данные)</label>
                    <div className="flex gap-2">
                      <button onClick={()=>setEnhancerProvider('alpha_vantage')} className={`px-3 py-1 rounded text-sm ${enhancerProvider==='alpha_vantage'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Alpha Vantage</button>
                      <button onClick={()=>setEnhancerProvider('finnhub')} className={`px-3 py-1 rounded text-sm ${enhancerProvider==='finnhub'?'bg-gray-900 text-white':'bg-gray-200 text-gray-800'}`}>Finnhub</button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Настройки провайдеров применяются глобально.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            Сбросить по умолчанию
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Save className="w-4 h-4" />
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}