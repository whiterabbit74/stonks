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
export function useFormValidation<T extends Record<string, any>>(
  initialState: T,
  validators: Partial<Record<keyof T, (value: any) => boolean | string>>
) {
  const [values, setValues] = useState<T>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  
  const setValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Validate field
    if (validators[field]) {
      const result = validators[field]!(value);
      setErrors(prev => ({
        ...prev,
        [field]: typeof result === 'string' ? result : ''
      }));
    }
  }, [validators]);
  
  const setTouched = useCallback((field: keyof T, isTouched: boolean = true) => {
    setTouched(prev => ({ ...prev, [field]: isTouched }));
  }, []);
  
  const validateAll = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;
    
    Object.keys(validators).forEach(field => {
      const validator = validators[field as keyof T];
      if (validator) {
        const result = validator(values[field as keyof T]);
        if (typeof result === 'string' && result.length > 0) {
          newErrors[field as keyof T] = result;
          isValid = false;
        } else if (result === false) {
          newErrors[field as keyof T] = 'Invalid value';
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
    setTouched({});
  }, [initialState]);
  
  return {
    values,
    errors,
    touched,
    setValue,
    setTouched,
    validateAll,
    reset,
    isValid: Object.keys(errors).length === 0
  };
}