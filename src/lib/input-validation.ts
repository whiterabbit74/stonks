/**
 * Input validation and sanitization utilities
 */

import { logWarn } from './error-logger';

/**
 * Sanitizes and validates numeric input from form fields
 */
export function sanitizeNumericInput(
  value: string,
  options: {
    min?: number;
    max?: number;
    precision?: number;
    allowNegative?: boolean;
    fallback?: number;
  } = {}
): number {
  const {
    min = -Infinity,
    max = Infinity,
    precision = 10,
    allowNegative = true,
    fallback = 0
  } = options;
  
  try {
    // Remove any non-numeric characters except decimal point and minus sign
    let cleaned = value.replace(/[^0-9.-]/g, '');
    
    // Handle negative numbers
    if (!allowNegative) {
      cleaned = cleaned.replace(/-/g, '');
    } else {
      // Ensure only one minus sign at the beginning
      const hasNegative = cleaned.startsWith('-');
      cleaned = cleaned.replace(/-/g, '');
      if (hasNegative) cleaned = '-' + cleaned;
    }
    
    // Handle decimal points - only one allowed
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Parse the number
    const parsed = parseFloat(cleaned);
    
    // Check if parsing failed
    if (!Number.isFinite(parsed)) {
      logWarn('ui', 'Invalid numeric input, using fallback', {
        input: value,
        cleaned,
        fallback
      });
      return fallback;
    }
    
    // Apply precision rounding
    const rounded = Math.round(parsed * Math.pow(10, precision)) / Math.pow(10, precision);
    
    // Apply min/max constraints
    const constrained = Math.max(min, Math.min(max, rounded));
    
    if (constrained !== rounded) {
      logWarn('ui', 'Input value constrained to valid range', {
        input: value,
        original: rounded,
        constrained,
        min,
        max
      });
    }
    
    return constrained;
  } catch (error) {
    logWarn('ui', 'Error sanitizing numeric input', {
      input: value,
      error: (error as Error).message,
      fallback
    });
    return fallback;
  }
}

/**
 * Sanitizes text input by removing potentially dangerous characters
 */
export function sanitizeTextInput(
  value: string,
  options: {
    maxLength?: number;
    allowedChars?: RegExp;
    removeHtml?: boolean;
    trim?: boolean;
  } = {}
): string {
  const {
    maxLength = 10000,
    allowedChars,
    removeHtml = true,
    trim = true
  } = options;
  
  try {
    let cleaned = value;
    
    // Trim whitespace if requested
    if (trim) {
      cleaned = cleaned.trim();
    }
    
    // Remove HTML tags if requested
    if (removeHtml) {
      cleaned = cleaned.replace(/<[^>]*>/g, '');
    }
    
    // Apply character filtering if specified
    if (allowedChars) {
      cleaned = cleaned.replace(new RegExp(`[^${allowedChars.source}]`, 'g'), '');
    }
    
    // Apply length limit
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
      logWarn('ui', 'Text input truncated to maximum length', {
        originalLength: value.length,
        maxLength,
        truncated: cleaned.length
      });
    }
    
    return cleaned;
  } catch (error) {
    logWarn('ui', 'Error sanitizing text input', {
      input: value,
      error: (error as Error).message
    });
    return '';
  }
}

/**
 * Validates email addresses
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates and sanitizes file names
 */
export function sanitizeFileName(filename: string): string {
  try {
    // Remove path traversal attempts and dangerous characters
    let cleaned = filename
      .replace(/[\/\\:*?"<>|]/g, '_')  // Replace dangerous chars with underscore
      .replace(/\.+/g, '.')            // Replace multiple dots with single dot
      .replace(/^\.+/, '')             // Remove leading dots
      .replace(/\.+$/, '')             // Remove trailing dots
      .trim();
    
    // Ensure it's not empty
    if (!cleaned) {
      cleaned = 'untitled';
    }
    
    // Limit length
    if (cleaned.length > 255) {
      const ext = cleaned.substring(cleaned.lastIndexOf('.'));
      const name = cleaned.substring(0, cleaned.lastIndexOf('.'));
      cleaned = name.substring(0, 255 - ext.length) + ext;
    }
    
    return cleaned;
  } catch (error) {
    logWarn('ui', 'Error sanitizing filename', {
      filename,
      error: (error as Error).message
    });
    return 'untitled';
  }
}

/**
 * Creates a debounced validation function
 */
export function createDebouncedValidator<T>(
  validator: (value: T) => boolean | Promise<boolean>,
  delay: number = 300
): (value: T) => Promise<boolean> {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (value: T): Promise<boolean> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await validator(value);
          resolve(result);
        } catch (error) {
          logWarn('ui', 'Validation error', {
            error: (error as Error).message
          });
          resolve(false);
        }
      }, delay);
    });
  };
}

/**
 * Input validation constraints for different field types
 */
export const VALIDATION_CONSTRAINTS = {
  commission: {
    fixed: { min: 0, max: 1000, precision: 2 },
    percentage: { min: 0, max: 10, precision: 3 }
  },
  ibs: {
    min: 0,
    max: 1,
    precision: 2
  },
  leverage: {
    min: 0.1,
    max: 10,
    precision: 2
  },
  holdDays: {
    min: 1,
    max: 365,
    precision: 0
  },
  capitalUsage: {
    min: 1,
    max: 100,
    precision: 0
  },
  initialCapital: {
    min: 100,
    max: 10000000,
    precision: 2
  },
  thresholdPct: {
    min: 0.1,
    max: 50,
    precision: 1
  },
  indicatorPane: {
    min: 5,
    max: 50,
    precision: 0
  }
} as const;