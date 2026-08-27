import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useFormValidation,
  useValidatedNumericInput,
  useValidatedTextInput,
} from '../useValidatedInput';

describe('useValidatedNumericInput', () => {
  it('starts from initialValue and sanitizes on change', () => {
    const { result } = renderHook(() =>
      useValidatedNumericInput({ initialValue: 10, min: 0, max: 100, precision: 2 })
    );

    expect(result.current.value).toBe('10');
    expect(result.current.numericValue).toBe(10);
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleChange('12.348');
    });
    expect(result.current.value).toBe('12.348');
    expect(result.current.numericValue).toBe(12.35);
    expect(result.current.isValid).toBe(true);
  });

  it('clamps to min/max and reports the raw string as invalid when it is not a number', () => {
    const { result } = renderHook(() =>
      useValidatedNumericInput({ initialValue: 5, min: 0, max: 10 })
    );

    act(() => {
      result.current.handleChange('99');
    });
    expect(result.current.numericValue).toBe(10);
    expect(result.current.value).toBe('99');

    act(() => {
      result.current.handleChange('abc');
    });
    expect(result.current.isValid).toBe(false);
    expect(result.current.numericValue).toBe(10);
  });

  it('resets both the raw and numeric values', () => {
    const { result } = renderHook(() => useValidatedNumericInput({ initialValue: 3 }));

    act(() => {
      result.current.handleChange('8');
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe('3');
    expect(result.current.numericValue).toBe(3);
  });
});

describe('useValidatedTextInput', () => {
  it('keeps the raw value and a sanitized copy, and treats empty sanitized text as invalid', () => {
    const { result } = renderHook(() =>
      useValidatedTextInput({ initialValue: 'hi', maxLength: 5, removeHtml: true })
    );

    expect(result.current.value).toBe('hi');
    expect(result.current.sanitizedValue).toBe('hi');
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleChange('<b>hello-world</b>');
    });
    expect(result.current.value).toBe('<b>hello-world</b>');
    expect(result.current.sanitizedValue).toBe('hello');
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleChange('   ');
    });
    expect(result.current.sanitizedValue).toBe('');
    expect(result.current.isValid).toBe(false);
  });

  it('resets to the initial text', () => {
    const { result } = renderHook(() => useValidatedTextInput({ initialValue: 'seed' }));

    act(() => {
      result.current.handleChange('other');
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe('seed');
    expect(result.current.sanitizedValue).toBe('seed');
  });
});

describe('useFormValidation', () => {
  const validators = {
    name: (value: string) => (value.trim().length >= 2 ? true : 'Too short'),
    qty: (value: number) => value > 0,
  };

  it('stores a string error from the field validator', () => {
    const { result } = renderHook(() =>
      useFormValidation({ name: '', qty: 1 }, validators)
    );

    act(() => {
      result.current.setValue('name', 'A');
    });

    expect(result.current.values.name).toBe('A');
    expect(result.current.errors.name).toBe('Too short');
    expect(result.current.isValid).toBe(false);
  });

  it('validateAll collects string errors and boolean-false as "Invalid value"', () => {
    const { result } = renderHook(() =>
      useFormValidation({ name: 'A', qty: 0 }, validators)
    );

    let ok = true;
    act(() => {
      ok = result.current.validateAll();
    });

    expect(ok).toBe(false);
    expect(result.current.errors.name).toBe('Too short');
    expect(result.current.errors.qty).toBe('Invalid value');
  });

  it('validateAll returns true and clears errors when every field passes', () => {
    const { result } = renderHook(() =>
      useFormValidation({ name: 'IBM', qty: 2 }, validators)
    );

    let ok = false;
    act(() => {
      ok = result.current.validateAll();
    });

    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
    expect(result.current.isValid).toBe(true);
  });

  it('tracks touched and resets values, errors, and touched together', () => {
    const { result } = renderHook(() =>
      useFormValidation({ name: '', qty: 1 }, validators)
    );

    act(() => {
      result.current.setValue('name', 'A');
      result.current.setTouched('name');
    });
    expect(result.current.touched.name).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.values).toEqual({ name: '', qty: 1 });
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.isValid).toBe(true);
  });

  it('keeps isValid true after setValue when the validator returns true', () => {
    const { result } = renderHook(() =>
      useFormValidation({ name: '', qty: 1 }, validators)
    );

    act(() => {
      result.current.setValue('name', 'IBM');
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.isValid).toBe(true);
  });
});
