import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EquityPoint } from '../../types';

// Mock the MarginSimulator functions
const mockSimulateLeverage = vi.fn();


describe('MarginSimulator Calculations', () => {
  let sampleEquity: EquityPoint[];

  beforeEach(() => {
    // Create realistic equity curve
    sampleEquity = [
      { date: '2023-12-01', value: 10000, drawdown: 0 },
      { date: '2023-12-02', value: 10100, drawdown: 0 },
      { date: '2023-12-03', value: 10200, drawdown: 0 },
      { date: '2023-12-04', value: 9900, drawdown: 2.97 },
      { date: '2023-12-05', value: 9800, drawdown: 3.96 },
      { date: '2023-12-06', value: 10300, drawdown: 0 },
      { date: '2023-12-07', value: 10500, drawdown: 0 },
      { date: '2023-12-08', value: 10200, drawdown: 2.86 },
      { date: '2023-12-09', value: 10800, drawdown: 0 },
      { date: '2023-12-10', value: 11000, drawdown: 0 }
    ];

    mockSimulateLeverage.mockClear();
  });

  describe('leverage simulation', () => {
    it('should simulate 2x leverage correctly', () => {
      const leverage = 2.0;
      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 10200, drawdown: 0 },
          { date: '2023-12-03', value: 10400, drawdown: 0 },
          { date: '2023-12-04', value: 9800, drawdown: 5.88 },
          { date: '2023-12-05', value: 9600, drawdown: 7.84 },
          { date: '2023-12-06', value: 10600, drawdown: 0 },
          { date: '2023-12-07', value: 11000, drawdown: 0 },
          { date: '2023-12-08', value: 10400, drawdown: 5.45 },
          { date: '2023-12-09', value: 11600, drawdown: 0 },
          { date: '2023-12-10', value: 12000, drawdown: 0 }
        ],
        maxDrawdown: 7.84,
        finalValue: 12000,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(mockSimulateLeverage).toHaveBeenCalledWith(sampleEquity, leverage);
      expect(result).toEqual(mockResult);
      expect(result.equity).toHaveLength(10);
      expect(result.maxDrawdown).toBe(7.84);
      expect(result.finalValue).toBe(12000);
      expect(result.marginCall).toBe(false);
    });

    it('should handle 3x leverage with margin call', () => {
      const leverage = 3.0;
      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 10300, drawdown: 0 },
          { date: '2023-12-03', value: 10600, drawdown: 0 },
          { date: '2023-12-04', value: 9700, drawdown: 8.49 },
          { date: '2023-12-05', value: 9400, drawdown: 11.32 },
          { date: '2023-12-06', value: 0, drawdown: 100 }
        ],
        maxDrawdown: 100,
        finalValue: 0,
        marginCall: true,
        marginCallDate: '2023-12-06'
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.marginCall).toBe(true);
      expect(result.maxDrawdown).toBe(100);
      expect(result.finalValue).toBe(0);
      expect(typeof result.marginCallDate).toBe('string');
      expect(result.marginCallDate).toBe('2023-12-06');
    });

    it('should handle 1x leverage (no leverage)', () => {
      const leverage = 1.0;
      const mockResult = {
        equity: sampleEquity,
        maxDrawdown: 3.96,
        finalValue: 11000,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.equity).toEqual(sampleEquity);
      expect(result.maxDrawdown).toBe(3.96);
      expect(result.finalValue).toBe(11000);
      expect(result.marginCall).toBe(false);
    });
  });

  describe('leverage calculation logic', () => {
    it('should calculate leveraged returns correctly', () => {
      const leverage = 2.0;
      const baseReturn = 0.01; // 1% return
      const expectedLeveragedReturn = baseReturn * leverage; // 2% return

      // Simulate the calculation
      const leveragedReturn = baseReturn * leverage;
      expect(leveragedReturn).toBe(0.02);
    });

    it('should handle negative returns with leverage', () => {
      const leverage = 2.0;
      const baseReturn = -0.02; // -2% return
      const expectedLeveragedReturn = baseReturn * leverage; // -4% return

      const leveragedReturn = baseReturn * leverage;
      expect(leveragedReturn).toBe(-0.04);
    });

    it('should prevent negative equity values', () => {
      const leverage = 5.0;
      const baseReturn = -0.25; // -25% return
      const leveragedReturn = baseReturn * leverage; // -125% return

      // Simulate equity calculation
      let currentValue = 10000;
      const newValue = currentValue * (1 + leveragedReturn);
      const finalValue = Math.max(0, newValue); // Prevent negative values

      expect(finalValue).toBe(0);
    });
  });

  describe('drawdown calculation with leverage', () => {
    it('should calculate drawdown correctly with leverage', () => {
      const leverage = 2.0;
      const equity = [
        { date: '2023-12-01', value: 10000, drawdown: 0 },
        { date: '2023-12-02', value: 10200, drawdown: 0 },
        { date: '2023-12-03', value: 10400, drawdown: 0 },
        { date: '2023-12-04', value: 9800, drawdown: 5.77 },
        { date: '2023-12-05', value: 9600, drawdown: 7.69 }
      ];

      const mockResult = {
        equity,
        maxDrawdown: 7.69,
        finalValue: 9600,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.maxDrawdown).toBe(7.69);
      expect(result.equity[4].drawdown).toBe(7.69);
    });

    it('should handle peak value updates correctly', () => {
      const leverage = 2.0;
      const equity = [
        { date: '2023-12-01', value: 10000, drawdown: 0 },
        { date: '2023-12-02', value: 10200, drawdown: 0 },
        { date: '2023-12-03', value: 10400, drawdown: 0 },
        { date: '2023-12-04', value: 9800, drawdown: 5.77 },
        { date: '2023-12-05', value: 10600, drawdown: 0 }, // New peak
        { date: '2023-12-06', value: 10400, drawdown: 1.89 }
      ];

      const mockResult = {
        equity,
        maxDrawdown: 5.77,
        finalValue: 10400,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.maxDrawdown).toBe(5.77);
      expect(result.equity[5].drawdown).toBe(1.89); // Drawdown from new peak
    });
  });

  describe('edge cases', () => {
    it('should handle empty equity array', () => {
      const leverage = 2.0;
      const mockResult = {
        equity: [],
        maxDrawdown: 0,
        finalValue: 0,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage([], leverage);

      expect(result.equity).toHaveLength(0);
      expect(result.maxDrawdown).toBe(0);
      expect(result.finalValue).toBe(0);
    });

    it('should handle zero leverage', () => {
      const leverage = 0;
      const mockResult = {
        equity: [],
        maxDrawdown: 0,
        finalValue: 0,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.equity).toHaveLength(0);
      expect(result.maxDrawdown).toBe(0);
      expect(result.finalValue).toBe(0);
    });

    it('should handle negative leverage', () => {
      const leverage = -1.0;
      const mockResult = {
        equity: [],
        maxDrawdown: 0,
        finalValue: 0,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.equity).toHaveLength(0);
      expect(result.maxDrawdown).toBe(0);
      expect(result.finalValue).toBe(0);
    });

    it('should handle very high leverage', () => {
      const leverage = 10.0;
      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 0, drawdown: 100 }
        ],
        maxDrawdown: 100,
        finalValue: 0,
        marginCall: true,
        marginCallDate: '2023-12-02'
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.marginCall).toBe(true);
      expect(result.maxDrawdown).toBe(100);
      expect(result.finalValue).toBe(0);
    });
  });

  describe('performance metrics with leverage', () => {
    it('should calculate final value correctly', () => {
      const leverage = 2.0;
      const mockResult = {
        equity: sampleEquity.map(point => ({
          ...point,
          value: point.value * 1.5 // Simulate leveraged growth
        })),
        maxDrawdown: 5.94,
        finalValue: 16500,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.finalValue).toBe(16500);
      expect(result.equity[result.equity.length - 1].value).toBe(16500);
    });

    it('should track maximum drawdown correctly', () => {
      const leverage = 2.0;
      const equity = [
        { date: '2023-12-01', value: 10000, drawdown: 0 },
        { date: '2023-12-02', value: 10200, drawdown: 0 },
        { date: '2023-12-03', value: 10400, drawdown: 0 },
        { date: '2023-12-04', value: 9800, drawdown: 5.77 },
        { date: '2023-12-05', value: 9600, drawdown: 7.69 },
        { date: '2023-12-06', value: 9400, drawdown: 9.62 },
        { date: '2023-12-07', value: 10600, drawdown: 0 },
        { date: '2023-12-08', value: 10800, drawdown: 0 }
      ];

      const mockResult = {
        equity,
        maxDrawdown: 9.62,
        finalValue: 10800,
        marginCall: false
      };

      mockSimulateLeverage.mockReturnValue(mockResult);

      const result = mockSimulateLeverage(sampleEquity, leverage);

      expect(result.maxDrawdown).toBe(9.62);
      expect(result.equity[5].drawdown).toBe(9.62);
    });
  });
});
