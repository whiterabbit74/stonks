import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as errorLogger from './error-logger';
import {
  createDebouncedValidator,
  isValidEmail,
  sanitizeFileName,
  sanitizeNumericInput,
  sanitizeTextInput,
} from './input-validation';

const logWarnSpy = vi.spyOn(errorLogger, 'logWarn');

beforeEach(() => {
  logWarnSpy.mockClear();
  logWarnSpy.mockImplementation((category, message, context) => ({
    id: 'mock',
    timestamp: 0,
    level: 'warn',
    category,
    message,
    context,
  }) as any);
});

afterAll(() => {
  logWarnSpy.mockRestore();
});

describe('sanitizeNumericInput', () => {
  it('removes formatting characters and respects precision constraints', () => {
    const result = sanitizeNumericInput('1,234.5678', {
      min: 0,
      max: 5000,
      precision: 2,
    });

    expect(result).toBe(1234.57);
    expect(logWarnSpy).not.toHaveBeenCalled();
  });

  it('strips negative sign when negatives are not allowed', () => {
    const result = sanitizeNumericInput(' -42.9 ', { allowNegative: false, precision: 1 });
    expect(result).toBe(42.9);
  });

  it('falls back to the provided default value when parsing fails', () => {
    const result = sanitizeNumericInput('abc', { fallback: 10 });
    expect(result).toBe(10);
    expect(logWarnSpy).toHaveBeenCalledWith(
      'ui',
      'Invalid numeric input, using fallback',
      expect.objectContaining({ input: 'abc', fallback: 10 }),
    );
  });

  it('clamps values outside of the allowed range and logs the adjustment', () => {
    const result = sanitizeNumericInput('999', { min: 0, max: 100, precision: 0 });
    expect(result).toBe(100);
    expect(logWarnSpy).toHaveBeenCalledWith(
      'ui',
      'Input value constrained to valid range',
      expect.objectContaining({ constrained: 100, min: 0, max: 100 }),
    );
  });
});

describe('sanitizeTextInput', () => {
  it('removes html tags and potentially dangerous characters', () => {
    const result = sanitizeTextInput('  <b>Hello; &World:</b>=  ');
    expect(result).toBe('Hello World');
  });

  it('enforces maximum length and logs when truncation occurs', () => {
    const result = sanitizeTextInput('abcdef', { maxLength: 3, trim: false, removeHtml: false });
    expect(result).toBe('abc');
    expect(logWarnSpy).toHaveBeenCalledWith(
      'ui',
      'Text input truncated to maximum length',
      expect.objectContaining({ originalLength: 6, maxLength: 3, truncated: 3 }),
    );
  });
});

describe('createDebouncedValidator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logWarnSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with validator result after the specified delay', async () => {
    const validator = vi.fn().mockResolvedValue(true);
    const debounced = createDebouncedValidator(validator, 100);

    const promise = debounced('value');
    expect(validator).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe(true);
    expect(validator).toHaveBeenCalledWith('value');
  });

  it('logs a warning and resolves to false when the validator throws', async () => {
    const validator = vi.fn().mockRejectedValue(new Error('fail'));
    const debounced = createDebouncedValidator(validator, 50);

    const promise = debounced('value');
    await vi.advanceTimersByTimeAsync(50);

    await expect(promise).resolves.toBe(false);
    expect(logWarnSpy).toHaveBeenCalledWith(
      'ui',
      'Validation error',
      expect.objectContaining({ error: 'fail' }),
    );
  });
});

describe('sanitizeFileName', () => {
  it('removes path traversal and dangerous characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc_passwd');
  });

  it('normalizes reserved device names and empty results', () => {
    expect(sanitizeFileName('CON')).toBe('CON_RESERVED');
    expect(sanitizeFileName('..')).toBe('unnamed_file');
  });
});

describe('isValidEmail', () => {
  it('validates email addresses with simple structure checks', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user@localhost')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
  });
});
