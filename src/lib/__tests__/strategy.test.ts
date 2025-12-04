import { describe, it, expect } from 'vitest';
import { 
  createDefaultStrategy, 
  createDefaultRiskSettings, 
  createDefaultPositionSizing,
  validateStrategy,
  updateStrategyParameter,
  getStrategyParameter,
  cloneStrategy,
  STRATEGY_TEMPLATES,
  createStrategyFromTemplate
} from '../strategy';
import type { Strategy } from '../../types';

describe('Strategy', () => {
  describe('createDefaultStrategy', () => {
    it('should create a valid default strategy', () => {
      const strategy = createDefaultStrategy();
      
      expect(strategy.name).toBe('New Strategy');
      expect(strategy.description).toBe('Custom trading strategy');
      expect(strategy.entryConditions).toEqual([]);
      expect(strategy.exitConditions).toEqual([]);
      expect(strategy.riskManagement).toBeDefined();
      expect(strategy.positionSizing).toBeDefined();
      expect(strategy.parameters).toEqual({});
    });
  });

  describe('createDefaultRiskSettings', () => {
    it('should create valid default risk settings', () => {
      const riskSettings = createDefaultRiskSettings();
      
      expect(riskSettings.initialCapital).toBe(10000);
      expect(riskSettings.capitalUsage).toBe(100);
      expect(riskSettings.maxPositionSize).toBe(1);
      expect(riskSettings.stopLoss).toBe(2);
      expect(riskSettings.takeProfit).toBe(4);
      expect(riskSettings.useStopLoss).toBe(false);
      expect(riskSettings.useTakeProfit).toBe(false);
      expect(riskSettings.maxPositions).toBe(1);
      expect(riskSettings.maxHoldDays).toBe(30);
      expect(riskSettings.commission.type).toBe('percentage');
      expect(riskSettings.commission.percentage).toBe(0);
      expect(riskSettings.slippage).toBe(0);
    });
  });

  describe('createDefaultPositionSizing', () => {
    it('should create valid default position sizing', () => {
      const positionSizing = createDefaultPositionSizing();
      
      expect(positionSizing.type).toBe('percentage');
      expect(positionSizing.value).toBe(10);
    });
  });

  describe('validateStrategy', () => {
    it('should validate a complete strategy', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: { testParam: 1 },
        entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
        exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const result = validateStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const incompleteStrategy = {
        name: 'Incomplete Strategy',
        parameters: {}
      } as Strategy;

      const result = validateStrategy(incompleteStrategy);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('id'))).toBe(true);
    });

    it('should detect missing entry conditions', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: {},
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const result = validateStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('entryConditions'))).toBe(true);
    });

    it('should detect missing exit conditions', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: {},
        entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const result = validateStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('exitConditions'))).toBe(true);
    });
  });

  describe('updateStrategyParameter', () => {
    it('should update existing parameter', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: { existingParam: 1 },
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const updated = updateStrategyParameter(strategy, 'existingParam', 2);
      expect(updated.parameters.existingParam).toBe(2);
      expect(updated.parameters).not.toBe(strategy.parameters); // Should be new object
    });

    it('should add new parameter', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: {},
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const updated = updateStrategyParameter(strategy, 'newParam', 'test');
      expect(updated.parameters.newParam).toBe('test');
    });
  });

  describe('getStrategyParameter', () => {
    it('should return existing parameter', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: { testParam: 42 },
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const value = getStrategyParameter(strategy, 'testParam');
      expect(value).toBe(42);
    });

    it('should return default value for missing parameter', () => {
      const strategy: Strategy = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'test',
        parameters: {},
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const value = getStrategyParameter(strategy, 'missingParam', 'default');
      expect(value).toBe('default');
    });
  });

  describe('cloneStrategy', () => {
    it('should create a deep copy of strategy', () => {
      const original: Strategy = {
        id: 'original-strategy',
        name: 'Original Strategy',
        description: 'Original description',
        type: 'test',
        parameters: { param1: 1, param2: 'test' },
        entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
        exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const cloned = cloneStrategy(original);
      
      // Should be different objects
      expect(cloned).not.toBe(original);
      expect(cloned.parameters).not.toBe(original.parameters);
      expect(cloned.entryConditions).not.toBe(original.entryConditions);
      expect(cloned.exitConditions).not.toBe(original.exitConditions);
      expect(cloned.riskManagement).not.toBe(original.riskManagement);
      expect(cloned.positionSizing).not.toBe(original.positionSizing);
      
      // But should have same values
      expect(cloned.id).toBe(original.id);
      expect(cloned.name).toBe(original.name);
      expect(cloned.parameters).toEqual(original.parameters);
      expect(cloned.entryConditions).toEqual(original.entryConditions);
      expect(cloned.exitConditions).toEqual(original.exitConditions);
    });

    it('should allow changing ID when cloning', () => {
      const original: Strategy = {
        id: 'original-strategy',
        name: 'Original Strategy',
        description: 'Original description',
        type: 'test',
        parameters: {},
        entryConditions: [],
        exitConditions: [],
        riskManagement: createDefaultRiskSettings(),
        positionSizing: createDefaultPositionSizing()
      };

      const cloned = cloneStrategy(original, 'new-strategy-id');
      expect(cloned.id).toBe('new-strategy-id');
      expect(cloned.name).toBe(original.name);
    });
  });

  describe('STRATEGY_TEMPLATES', () => {
    it('should contain IBS Mean Reversion template', () => {
      const ibsTemplate = STRATEGY_TEMPLATES.find(t => t.id === 'ibs-mean-reversion');
      expect(ibsTemplate).toBeDefined();
      expect(ibsTemplate?.name).toBe('IBS Mean Reversion');
      expect(ibsTemplate?.category).toBe('Mean Reversion');
      expect(ibsTemplate?.defaultStrategy.parameters).toHaveProperty('lowIBS');
      expect(ibsTemplate?.defaultStrategy.parameters).toHaveProperty('highIBS');
      expect(ibsTemplate?.defaultStrategy.parameters).toHaveProperty('maxHoldDays');
    });
  });

  describe('createStrategyFromTemplate', () => {
    it('should create strategy from template', () => {
      const template = STRATEGY_TEMPLATES[0];
      const strategy = createStrategyFromTemplate(template, 'custom-id');
      
      expect(strategy.id).toBe('custom-id');
      expect(strategy.name).toBe(template.defaultStrategy.name);
      expect(strategy.description).toBe(template.defaultStrategy.description);
      expect(strategy.parameters).toEqual(template.defaultStrategy.parameters);
      expect(strategy.entryConditions).toEqual(template.defaultStrategy.entryConditions);
      expect(strategy.exitConditions).toEqual(template.defaultStrategy.exitConditions);
      expect(strategy.riskManagement).toBeDefined();
      expect(strategy.positionSizing).toBeDefined();
    });

    it('should generate unique ID if not provided', () => {
      const template = STRATEGY_TEMPLATES[0];
      const strategy1 = createStrategyFromTemplate(template);
      
      // Add small delay to ensure different timestamps
      setTimeout(() => {
        const strategy2 = createStrategyFromTemplate(template);
        expect(strategy1.id).not.toBe(strategy2.id);
        expect(strategy1.id).toMatch(/^strategy-\d+$/);
        expect(strategy2.id).toMatch(/^strategy-\d+$/);
      }, 1);
    });
  });
});
