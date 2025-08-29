import React, { useState } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import type { Strategy } from '../types';
import { createDefaultStrategy } from '../lib/strategy';

interface StrategySettingsProps {
  strategy: Strategy;
  onSave: (updatedStrategy: Strategy) => void;
  onClose: () => void;
}

export function StrategySettings({ strategy, onSave, onClose, mode = 'modal' }: StrategySettingsProps & { mode?: 'modal' | 'inline' }) {
  const [editedStrategy, setEditedStrategy] = useState<Strategy>({ ...strategy });

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
      riskManagement: defaults.riskManagement || strategy.riskManagement,
      positionSizing: defaults.positionSizing || strategy.positionSizing,
      type: strategy.type,
    });
  };

  const getParameterConfig = (strategyId: string) => {
    const configs: Record<string, Record<string, { label: string; min: number; max: number; step?: number; description?: string }>> = {
      'ibs-mean-reversion': {
        lowIBS: { 
          label: 'Порог входа (Low IBS)', 
          min: 0.01, 
          max: 0.5, 
          step: 0.01, 
          description: 'Вход в лонг, когда IBS ниже этого значения (close близко к дневному минимуму). По умолчанию: 0.1' 
        },
        highIBS: { 
          label: 'Порог выхода (High IBS)', 
          min: 0.5, 
          max: 0.99, 
          step: 0.01, 
          description: 'Выход из позиции, когда IBS выше этого значения (close близко к дневному максимуму). По умолчанию: 0.75' 
        },
        maxHoldDays: { 
          label: 'Максимум дней в позиции', 
          min: 1, 
          max: 365, 
          description: 'Принудительный выход через указанное число дней, если условие IBS не выполнено. По умолчанию: 30' 
        }
      }
    } as const;
    
    return configs[strategyId] || {};
  };

  const parameterConfig = getParameterConfig(strategy.id);

  const content = (
    <div className={`bg-white rounded-lg ${mode === 'modal' ? 'shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto' : 'border'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Параметры стратегии</h2>
          <p className="text-sm text-gray-600 mt-1">{strategy.name}</p>
          {strategy.id === 'ibs-mean-reversion' && (
            <p className="text-xs text-blue-600 mt-1">
              IBS = (Close − Low) / (High − Low) • Показывает, где закрытие дня внутри дневного диапазона
            </p>
          )}
        </div>
        {mode === 'modal' && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
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
          {mode === 'modal' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Отмена
            </button>
          )}
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
  );

  if (mode === 'inline') {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {content}
    </div>
  );
}