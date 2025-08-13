// Removed Papa import and CSV parsing utilities
import type {
  OHLCData,
  ValidationResult
} from '../types';

// Date parsing result interface
interface DateParseResult {
  isValid: boolean;
  date: Date | null;
  format?: string;
  error?: string;
}

// Numeric validation result interface
interface NumericValidationResult {
  isValid: boolean;
  value: number | null;
  normalized?: number;
  error?: string;
}

// Numeric validation options
interface NumericValidationOptions {
  min?: number;
  max?: number;
  precision?: number;
}


// Enhanced OHLC data validation
export function validateOHLCData(data: Partial<OHLCData>[]): ValidationResult & { warnings?: Array<{ field: string; message: string }> } {
  const errors: Array<{ code: string; message: string; row?: number }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  if (!Array.isArray(data) || data.length === 0) {
    errors.push({ code: 'EMPTY_DATA', message: 'No OHLC data provided' });
    return { isValid: false, errors, warnings };
  }

  // Check each data point
  for (let i = 0; i < Math.min(data.length, 100); i++) { // Check first 100 points
    const point = data[i];
    
    if (!point.date) {
      errors.push({ 
        code: 'MISSING_FIELD', 
        message: `Missing date at row ${i + 1}`, 
        row: i + 1 
      });
    }
    
    if (typeof point.open !== 'number' || isNaN(point.open)) {
      errors.push({ 
        code: 'MISSING_FIELD', 
        message: `Invalid open price at row ${i + 1}`, 
        row: i + 1 
      });
    }
    
    if (typeof point.high !== 'number' || isNaN(point.high)) {
      errors.push({ 
        code: 'MISSING_FIELD', 
        message: `Invalid high price at row ${i + 1}`, 
        row: i + 1 
      });
    }
    
    if (typeof point.low !== 'number' || isNaN(point.low)) {
      errors.push({ 
        code: 'MISSING_FIELD', 
        message: `Invalid low price at row ${i + 1}`, 
        row: i + 1 
      });
    }
    
    if (typeof point.close !== 'number' || isNaN(point.close)) {
      errors.push({ 
        code: 'MISSING_FIELD', 
        message: `Invalid close price at row ${i + 1}`, 
        row: i + 1 
      });
    }

    // Check OHLC relationships
    if (point.open && point.high && point.low && point.close) {
      if (point.high < Math.max(point.open, point.close) || 
          point.low > Math.min(point.open, point.close)) {
        warnings.push({
          field: `ohlc_row_${i + 1}`,
          message: `Invalid OHLC relationship at row ${i + 1}`
        });
      }
    }

    // Stop after finding 10 errors to avoid overwhelming the user
    if (errors.length >= 10) {
      errors.push({ 
        code: 'TOO_MANY_ERRORS', 
        message: '... and more validation errors' 
      });
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Enhanced date parsing
export function parseDate(dateStr: string | null | undefined): DateParseResult {
  if (!dateStr || dateStr === '') {
    return { isValid: false, date: null, error: 'Empty date string' };
  }

  try {
    // Try ISO format first (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return { isValid: true, date, format: 'YYYY-MM-DD' };
      }
    }

    // Try US format (M/D/YYYY or MM/DD/YYYY)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return { isValid: true, date, format: 'M/D/YYYY' };
      }
    }

    // Try general parsing
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return { isValid: true, date, format: 'AUTO' };
    }

    return { isValid: false, date: null, error: 'Invalid date format' };
  } catch {
    return { isValid: false, date: null, error: 'Date parsing failed' };
  }
}

// Detect date format from array of dates
export function detectDateFormat(dates: string[]): string | null {
  if (!dates || dates.length === 0) return null;

  const formats = new Set<string>();
  
  for (const dateStr of dates.slice(0, 10)) { // Check first 10 dates
    const result = parseDate(dateStr);
    if (result.isValid && result.format) {
      formats.add(result.format);
    }
  }

  // Return format if consistent, null if inconsistent
  return formats.size === 1 ? Array.from(formats)[0] : null;
}

// Enhanced numeric validation
export function validateNumeric(
  value: unknown, 
  options: NumericValidationOptions = {}
): NumericValidationResult {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, value: null, error: 'Empty value' };
  }

  const num = Number(value);
  if (isNaN(num)) {
    return { isValid: false, value: null, error: 'Not a valid number' };
  }

  // Check min/max constraints
  if (options.min !== undefined && num < options.min) {
    return { isValid: false, value: null, error: `Value below minimum (${options.min})` };
  }

  if (options.max !== undefined && num > options.max) {
    return { isValid: false, value: null, error: `Value above maximum (${options.max})` };
  }

  // Apply precision if specified
  let normalized = num;
  if (options.precision !== undefined) {
    normalized = Number(num.toFixed(options.precision));
  }

  return { isValid: true, value: num, normalized };
}

// Simple number validation (backward compatibility)
export function validateNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  const num = Number(value);
  return isNaN(num) ? null : num;
}