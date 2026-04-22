import { useState } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import type { Strategy } from '../types';
import { createDefaultStrategy } from '../lib/strategy';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

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

  const handleCommissionChange = (key: string, value: number | string) => {
    setEditedStrategy(prev => ({
      ...prev,
      riskManagement: {
        ...prev.riskManagement,
        commission: {
          ...prev.riskManagement.commission,
          [key]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    onSave(editedStrategy);
    onClose();
  };

  const handleReset = () => {
    // Confirmation dialog before reset
    const confirmed = window.confirm(
      'Вы уверены, что хотите сбросить настройки стратегии? Все изменения будут потеряны.'
    );
    if (!confirmed) return;

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
          description: 'Вход в лонг, когда IBS ниже этого значения (close близко к дневному минимуму). По умолчанию: 0.1. ВНИМАНИЕ: значения > 0.3 могут приводить к ложным сигналам при средних IBS!'
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
    <div className={mode === 'inline' ? 'rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-900' : ''}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-6 dark:border-gray-800">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Параметры стратегии</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{strategy.name}</p>
          {strategy.id === 'ibs-mean-reversion' && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
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
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Торговое плечо (%)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Процент заемных средств. 0% = без плеча, 50% = плечо 2:1, 75% = плечо 4:1
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={5}
                  value={((editedStrategy.riskManagement.leverage || 1) - 1) * 100}
                  onChange={(e) => handleRiskManagementChange('leverage', 1 + Number(e.target.value) / 100)}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={5}
                  value={((editedStrategy.riskManagement.leverage || 1) - 1) * 100}
                  onChange={(e) => handleRiskManagementChange('leverage', 1 + Number(e.target.value) / 100)}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>

            {/* Комиссии */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип комиссии
              </label>
              <select
                value={editedStrategy.riskManagement.commission.type}
                onChange={(e) => handleCommissionChange('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="percentage">Процент от стоимости сделки</option>
                <option value="fixed">Фиксированная сумма в долларах</option>
                <option value="combined">Комбинированная (фикс. + процент)</option>
              </select>
            </div>

            {(editedStrategy.riskManagement.commission.type === 'percentage' || editedStrategy.riskManagement.commission.type === 'combined') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Комиссия в процентах (%)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Процент от стоимости сделки (например: 0.1% = 0.1)
                </p>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.01}
                  value={editedStrategy.riskManagement.commission.percentage || 0}
                  onChange={(e) => handleCommissionChange('percentage', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {(editedStrategy.riskManagement.commission.type === 'fixed' || editedStrategy.riskManagement.commission.type === 'combined') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Фиксированная комиссия ($)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Фиксированная сумма за каждую сделку в долларах
                </p>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={editedStrategy.riskManagement.commission.fixed || 0}
                  onChange={(e) => handleCommissionChange('fixed', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900/50">
        <Button
          onClick={handleReset}
          variant="secondary"
          leftIcon={<RotateCcw className="w-4 h-4" />}
        >
          Сбросить по умолчанию
        </Button>

        <div className="flex gap-3">
          {mode === 'modal' && (
            <Button
              onClick={onClose}
              variant="secondary"
            >
              Отмена
            </Button>
          )}
          <Button
            onClick={handleSave}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );

  if (mode === 'inline') {
    return content;
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      showCloseButton={false}
      size="2xl"
      bodyClassName="p-0"
      contentClassName="max-h-[90vh] overflow-hidden"
    >
      <div className="max-h-[90vh] overflow-y-auto">{content}</div>
    </Modal>
  );
}
