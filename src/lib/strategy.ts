import type {
  Strategy,
  ValidationResult,
  IndicatorType,
  IndicatorCondition,
  RiskManagement
} from '../types';

// Default strategy structure
export function createDefaultStrategy(): Partial<Strategy> {
  return {
    name: 'New Strategy',
    description: 'Custom trading strategy',
    entryConditions: [],
    exitConditions: [],
    riskManagement: createDefaultRiskSettings(),
    positionSizing: createDefaultPositionSizing(),
    parameters: {}
  };
}

// Default risk management settings
export function createDefaultRiskSettings(): RiskManagement {
  return {
    initialCapital: 10000,
    capitalUsage: 100, // 100% по умолчанию - процент депозита на сделку
    maxPositionSize: 1,
    stopLoss: 2, // 2%
    takeProfit: 4, // 4%
    useStopLoss: false,
    useTakeProfit: false,
    maxPositions: 1,
    maxHoldDays: 30, // Добавляем maxHoldDays по умолчанию
    commission: {
      type: 'percentage',
      percentage: 0 // УБИРАЕМ КОМИССИЮ ДЛЯ ПРАВИЛЬНЫХ РАСЧЕТОВ
    },
    slippage: 0 // УБИРАЕМ ПРОСКАЛЬЗЫВАНИЕ ДЛЯ ПРАВИЛЬНЫХ РАСЧЕТОВ
  };
}

// Default position sizing
export function createDefaultPositionSizing(): Strategy['positionSizing'] {
  return {
    type: 'percentage',
    value: 10,
  };
}

// Create indicator condition
export function createIndicatorCondition(
  indicator: IndicatorType,
  operator: '>' | '<' | '>=' | '<=' | '==' | 'crossover' | 'crossunder',
  value: number | IndicatorType,
  lookback?: number
): IndicatorCondition {
  return {
    type: 'indicator',
    indicator,
    operator,
    value,
    period: getDefaultPeriod(indicator),
    lookback: lookback
  };
}

// Get default period for indicator
function getDefaultPeriod(indicator: IndicatorType): number {
  switch (indicator) {
    case 'SMA':
    case 'EMA':
      return 20;
    case 'RSI':
      return 14;
    case 'MACD':
      return 12;
    case 'BB':
      return 20;
    case 'STOCH':
      return 14;
    default:
      return 14;
  }
}

// Simple strategy templates
export const SIMPLE_STRATEGIES = [
  {
    id: 'sma-crossover',
    name: 'SMA Crossover',
    description: 'Buy when fast SMA crosses above slow SMA',
    parameters: {
      fastPeriod: 10,
      slowPeriod: 20
    }
  },
  {
    id: 'rsi-oversold',
    name: 'RSI Oversold',
    description: 'Buy when RSI is oversold (below 30)',
    parameters: {
      rsiPeriod: 14,
      oversoldLevel: 30,
      overboughtLevel: 70
    }
  },
  {
    id: 'ema-trend',
    name: 'EMA Trend Following',
    description: 'Buy when price is above EMA',
    parameters: {
      emaPeriod: 21
    }
  }
];

// Simple strategy functions
export function createStrategy(templateId: string, customId?: string): Strategy {
  const template = SIMPLE_STRATEGIES.find(s => s.id === templateId);
  if (!template) {
    throw new Error(`Strategy template not found: ${templateId}`);
  }

  const base = createDefaultStrategy();
  const normalizedParams: Record<string, number | string | boolean> = {};
  Object.entries(template.parameters as Record<string, number | string | boolean | undefined>).forEach(([k, v]) => {
    if (v !== undefined) normalizedParams[k] = v as number | string | boolean;
  });
  const strategyObj = {
    id: customId || `${templateId}-${Date.now()}`,
    name: template.name,
    description: template.description,
    type: templateId,
    parameters: normalizedParams,
    entryConditions: base.entryConditions || [],
    exitConditions: base.exitConditions || [],
    riskManagement: base.riskManagement as RiskManagement,
    positionSizing: base.positionSizing as Strategy['positionSizing'],
  };
  return strategyObj as unknown as Strategy;
}

export function validateStrategy(strategy: Strategy): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!strategy.id) {
    errors.push({ field: 'id', message: 'Strategy ID is required' });
  }

  if (!strategy.name) {
    errors.push({ field: 'name', message: 'Strategy name is required' });
  }

  if (!strategy.parameters) {
    errors.push({ field: 'parameters', message: 'Strategy parameters are required' });
  }

  // Check entry conditions
  if (!strategy.entryConditions || strategy.entryConditions.length === 0) {
    errors.push({ field: 'entryConditions', message: 'At least one entry condition is required' });
  }

  // Check exit conditions
  if (!strategy.exitConditions || strategy.exitConditions.length === 0) {
    errors.push({ field: 'exitConditions', message: 'At least one exit condition is required' });
  }

  return {
    isValid: errors.length === 0,
    errors: errors.map(e => `${e.field}: ${e.message}`),
  };
}

export function updateStrategyParameter(
  strategy: Strategy,
  key: string,
  value: number | string | boolean
): Strategy {
  return {
    ...strategy,
    parameters: {
      ...strategy.parameters,
      [key]: value
    }
  };
}

export function getStrategyParameter(
  strategy: Strategy,
  key: string,
  defaultValue?: any
): number | string | boolean | undefined {
  return strategy.parameters[key] !== undefined ? strategy.parameters[key] : defaultValue;
}

export function cloneStrategy(strategy: Strategy, newId?: string): Strategy {
  const defaults = createDefaultStrategy();
  return {
    ...strategy,
    id: newId !== undefined ? newId : strategy.id,
    parameters: { ...strategy.parameters },
    entryConditions: strategy.entryConditions ? [...strategy.entryConditions] : [],
    exitConditions: strategy.exitConditions ? [...strategy.exitConditions] : [],
    riskManagement: strategy.riskManagement
      ? { 
          ...strategy.riskManagement,
          commission: strategy.riskManagement.commission ? { ...strategy.riskManagement.commission } : { type: 'percentage', percentage: 0 }
        }
      : (defaults.riskManagement as RiskManagement),
    positionSizing: strategy.positionSizing
      ? { ...strategy.positionSizing }
      : (defaults.positionSizing as Strategy['positionSizing'])
  } as Strategy;
}

// Strategy templates
export const STRATEGY_TEMPLATES = [
  {
    id: 'ibs-mean-reversion',
    name: 'IBS Mean Reversion',
    description: 'Original Pine Script IBS Mean Reversion Strategy - Enter when IBS < lowIBS, Exit when IBS > highIBS or maxHoldDays reached',
    category: 'Mean Reversion',
    difficulty: 'intermediate',
    defaultStrategy: {
      name: 'IBS Mean Reversion (Pine Script)',
      description: 'Original Pine Script strategy: Enter when IBS < lowIBS, Exit when IBS > highIBS or after maxHoldDays',
      entryConditions: [createIndicatorCondition('IBS', '<', 0.1)],
      exitConditions: [createIndicatorCondition('IBS', '>', 0.75)],
      parameters: {
        lowIBS: 0.1,
        highIBS: 0.75,
        maxHoldDays: 30
      }
    } as Pick<Strategy, 'name' | 'description' | 'entryConditions' | 'exitConditions' | 'parameters'>
  }
];

// Template functions (упрощенные)
export function getStrategyTemplateById(id: string) {
  return STRATEGY_TEMPLATES.find(t => t.id === id);
}

export function createStrategyFromTemplate(template: any, customId?: string): Strategy {
  const defaultStrategy = template.defaultStrategy as Pick<Strategy, 'name' | 'description' | 'entryConditions' | 'exitConditions' | 'parameters'>;
  const base = createDefaultStrategy();
  const strategyObj2 = {
    id: customId || `strategy-${Date.now()}`,
    name: defaultStrategy.name,
    description: defaultStrategy.description,
    type: template.id, // Add template id as type for backward compatibility
    parameters: { ...defaultStrategy.parameters },
    entryConditions: [...defaultStrategy.entryConditions],
    exitConditions: [...defaultStrategy.exitConditions],
    riskManagement: base.riskManagement as RiskManagement,
    positionSizing: base.positionSizing as Strategy['positionSizing'],
  };
  return strategyObj2 as unknown as Strategy;
}

// Price condition
export function createPriceCondition(
  operator: '>' | '<' | '>=' | '<=' | '==',
  value: number | string
) {
  return {
    type: 'price',
    operator,
    value
  };
}

// Validation functions
export function validateCondition(condition: any): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  
  if (!condition.indicator) {
    errors.push({ field: 'indicator', message: 'Indicator type is required' });
  }
  
  if (condition.indicator === 'RSI' && typeof condition.value === 'number') {
    if (condition.value < 0 || condition.value > 100) {
      errors.push({ field: 'value', message: 'RSI value must be between 0 and 100' });
    }
  }
  
  if (condition.indicator === 'IBS' && typeof condition.value === 'number') {
    if (condition.value < 0 || condition.value > 1) {
      errors.push({ field: 'value', message: 'IBS value must be between 0 and 1' });
    }
  }
  
  if (condition.lookback !== undefined && condition.lookback <= 0) {
    errors.push({ field: 'lookback', message: 'Lookback period must be positive' });
  }
  
  if ((condition.operator === 'crossover' || condition.operator === 'crossunder') && 
      condition.type !== 'indicator') {
    errors.push({ field: 'operator', message: 'Crossover operators only work with indicators' });
  }
  
  return errors;
}

export function validateRiskSettings(riskSettings: any): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  
  if (riskSettings.initialCapital !== undefined && riskSettings.initialCapital <= 0) {
    errors.push({ field: 'initialCapital', message: 'Initial capital must be positive' });
  }
  
  // Допускаем значения в процентах до 10 (0-10)
  if (riskSettings.stopLoss !== undefined && (riskSettings.stopLoss < 0 || riskSettings.stopLoss > 10)) {
    errors.push({ field: 'stopLoss', message: 'Stop loss must be between 0% and 10%' });
  }

  if (riskSettings.takeProfit !== undefined && (riskSettings.takeProfit < 0 || riskSettings.takeProfit > 10)) {
    errors.push({ field: 'takeProfit', message: 'Take profit must be between 0% and 10%' });
  }
  
  if (riskSettings.slippage && (riskSettings.slippage < 0 || riskSettings.slippage >= 1)) {
    errors.push({ field: 'slippage', message: 'Slippage must be between 0 and 1' });
  }
  
  return errors;
}

export function validatePositionSizing(positionSizing: any): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  
  if (!positionSizing.value || positionSizing.value <= 0) {
    errors.push({ field: 'value', message: 'Position sizing value must be positive' });
  }
  
  if (positionSizing.type === 'percentage' && positionSizing.value > 100) {
    errors.push({ field: 'value', message: 'Percentage position sizing cannot exceed 100%' });
  }
  
  return errors;
}

// Strategy manipulation functions
export function addCondition(
  strategy: Strategy, 
  condition: IndicatorCondition, 
  type: 'entry' | 'exit'
): Strategy {
  const updated = { ...strategy };
  
  if (type === 'entry') {
    updated.entryConditions = [...(strategy.entryConditions || []), condition];
  } else {
    updated.exitConditions = [...(strategy.exitConditions || []), condition];
  }
  
  return updated;
}

export function removeCondition(
  strategy: Strategy, 
  index: number, 
  type: 'entry' | 'exit'
): Strategy {
  const updated = { ...strategy };
  
  if (type === 'entry' && strategy.entryConditions) {
    updated.entryConditions = strategy.entryConditions.filter((_, i) => i !== index);
  } else if (type === 'exit' && strategy.exitConditions) {
    updated.exitConditions = strategy.exitConditions.filter((_, i) => i !== index);
  }
  
  return updated;
}

export function updateCondition(
  strategy: Strategy, 
  index: number, 
  condition: IndicatorCondition, 
  type: 'entry' | 'exit'
): Strategy {
  const updated = { ...strategy };
  
  if (type === 'entry' && strategy.entryConditions) {
    updated.entryConditions = [...strategy.entryConditions];
    updated.entryConditions[index] = condition;
  } else if (type === 'exit' && strategy.exitConditions) {
    updated.exitConditions = [...strategy.exitConditions];
    updated.exitConditions[index] = condition;
  }
  
  return updated;
}