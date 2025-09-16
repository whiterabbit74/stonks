/**
 * Custom hook for validated numeric input handling
 */

import { useState, useCallback } from 'react';
import { sanitizeNumericInput, sanitizeTextInput } from '../lib/input-validation';

interface NumericInputOptions {
  min?: number;
  max?: number;
  precision?: number;
  allowNegative?: boolean;
  initialValue?: number;
}

interface TextInputOptions {
  maxLength?: number;
  allowedChars?: RegExp;
  removeHtml?: boolean;
  trim?: boolean;
  initialValue?: string;
}

/**
 * Hook for managing validated numeric input
 */
export function useValidatedNumericInput(options: NumericInputOptions = {}) {
  const { initialValue = 0, ...sanitizeOptions } = options;
  const [value, setValue] = useState<string>(String(initialValue));
  const [numericValue, setNumericValue] = useState<number>(initialValue);
  
  const handleChange = useCallback((inputValue: string) => {
    setValue(inputValue);
    const sanitized = sanitizeNumericInput(inputValue, {
      ...sanitizeOptions,
      fallback: numericValue
    });
    setNumericValue(sanitized);
  }, [numericValue, sanitizeOptions]);
  
  const reset = useCallback(() => {
    setValue(String(initialValue));
    setNumericValue(initialValue);
  }, [initialValue]);
  
  return {
    value,
    numericValue,
    handleChange,
    reset,
    isValid: !isNaN(Number(value)) && isFinite(Number(value))
  };
}

/**
 * Hook for managing validated text input
 */
export function useValidatedTextInput(options: TextInputOptions = {}) {
  const { initialValue = '', ...sanitizeOptions } = options;
  const [value, setValue] = useState<string>(initialValue);
  const [sanitizedValue, setSanitizedValue] = useState<string>(initialValue);
  
  const handleChange = useCallback((inputValue: string) => {
    setValue(inputValue);
    const sanitized = sanitizeTextInput(inputValue, sanitizeOptions);
    setSanitizedValue(sanitized);
  }, [sanitizeOptions]);
  
  const reset = useCallback(() => {
    setValue(initialValue);
    setSanitizedValue(initialValue);
  }, [initialValue]);
  
  return {
    value,
    sanitizedValue,
    handleChange,
    reset,
    isValid: sanitizedValue.length > 0
  };
}

/**
 * Hook for managing form validation state
 */
type ValidatorMap<T extends Record<string, unknown>> = Partial<{ [K in keyof T]: (value: T[K]) => boolean | string }>;

export function useFormValidation<T extends Record<string, unknown>>(
  initialState: T,
  validators: ValidatorMap<T>
) {
  const [values, setValues] = useState<T>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouchedState] = useState<Partial<Record<keyof T, boolean>>>({});

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));

    const validator = validators[field];
    if (validator) {
      const result = validator(value);
      setErrors(prev => ({
        ...prev,
        [field]: typeof result === 'string' ? result : ''
      }));
    }
  }, [validators]);

  const markTouched = useCallback(<K extends keyof T>(field: K, isTouched: boolean = true) => {
    setTouchedState(prev => ({ ...prev, [field]: isTouched }));
  }, []);

  const validateAll = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    (Object.keys(validators) as Array<keyof T>).forEach(field => {
      const validator = validators[field];
      if (validator) {
        const result = validator(values[field]);
        if (typeof result === 'string' && result.length > 0) {
          newErrors[field] = result;
          isValid = false;
        } else if (result === false) {
          newErrors[field] = 'Invalid value';
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validators]);
  
  const reset = useCallback(() => {
    setValues(initialState);
    setErrors({});
    setTouchedState({});
  }, [initialState]);

  return {
    values,
    errors,
    touched,
    setValue,
    setTouched: markTouched,
    validateAll,
    reset,
    isValid: Object.keys(errors).length === 0
  };
}