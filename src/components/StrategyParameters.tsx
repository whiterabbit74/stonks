import React from 'react';
import type { Strategy } from '../types';

interface StrategyParametersProps {
  strategy: Strategy;
  additionalParams?: Record<string, any>;
}

export function StrategyParameters({ strategy, additionalParams = {} }: StrategyParametersProps) {
  const commission = strategy.riskManagement.commission;
  const leverage = strategy.riskManagement.leverage || 1;
  
  // Форматируем комиссию
  const formatCommission = () => {
    switch (commission.type) {
      case 'fixed':
        return `Фиксированная: $${commission.fixed || 0}`;
      case 'percentage':
        return `Процентная: ${commission.percentage || 0}%`;
      case 'combined':
        return `Комбинированная: $${commission.fixed || 0} + ${commission.percentage || 0}%`;
      default:
        return 'Нет комиссии';
    }
  };

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Параметры стратегии
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        {/* IBS параметры */}
        {strategy.entryConditions?.ibs && (
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">IBS входа:</span>
            <span className="ml-2 font-mono text-blue-600 dark:text-blue-400">
              {'<'} {(strategy.entryConditions.ibs.threshold * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        {strategy.exitConditions?.ibs && (
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">IBS выхода:</span>
            <span className="ml-2 font-mono text-green-600 dark:text-green-400">
              {'>'} {(strategy.exitConditions.ibs.threshold * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        {/* Удержание */}
        {strategy.riskManagement.maxHoldDays && (
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Макс. удержание:</span>
            <span className="ml-2 font-mono text-amber-600 dark:text-amber-400">
              {strategy.riskManagement.maxHoldDays} дней
            </span>
          </div>
        )}
        
        {/* Комиссии */}
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Комиссия:</span>
          <span className="ml-2 font-mono text-red-600 dark:text-red-400">
            {formatCommission()}
          </span>
        </div>
        
        {/* Плечо */}
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Плечо:</span>
          <span className="ml-2 font-mono text-purple-600 dark:text-purple-400">
            {leverage}:1 ({leverage > 1 ? 'с плечом' : 'без плеча'})
          </span>
        </div>
        
        {/* Стоп-лосс */}
        {strategy.riskManagement.stopLoss && (
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Стоп-лосс:</span>
            <span className="ml-2 font-mono text-red-600 dark:text-red-400">
              -{(strategy.riskManagement.stopLoss * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        {/* Тейк-профит */}
        {strategy.riskManagement.takeProfit && (
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Тейк-профит:</span>
            <span className="ml-2 font-mono text-green-600 dark:text-green-400">
              +{(strategy.riskManagement.takeProfit * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        {/* Дополнительные параметры */}
        {Object.entries(additionalParams).map(([key, value]) => (
          <div key={key}>
            <span className="font-medium text-gray-700 dark:text-gray-300">{key}:</span>
            <span className="ml-2 font-mono text-gray-600 dark:text-gray-400">
              {typeof value === 'number' ? value.toFixed(2) : String(value)}
            </span>
          </div>
        ))}
      </div>
      
      {/* Индикаторы проблем */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-200 dark:bg-orange-900/30 rounded-sm"></div>
            Проблемы: IBS входа {'>'} 10% или IBS выхода {'<'} 75%
          </span>
        </div>
      </div>
    </div>
  );
}