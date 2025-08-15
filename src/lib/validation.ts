// Removed Papa import and CSV parsing utilities
import Papa from 'papaparse';
import type { ParseResult as PapaParseResult, ParseError as PapaParseError } from 'papaparse';
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
    // Стабильный парсинг YYYY-MM-DD в полдень UTC
    const tryStable = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
        return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      }
      return null;
    };
    const stable = tryStable(dateStr);
    if (stable && !isNaN(stable.getTime())) {
      return { isValid: true, date: stable, format: 'YYYY-MM-DD' };
    }
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

// CSV parsing function
export async function parseCSV(file: File): Promise<OHLCData[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: PapaParseResult<Record<string, unknown>>) => {
        try {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
            return;
          }

          const data = results.data as Record<string, unknown>[];
          const headers = Object.keys(data[0] || {});
          
          // Basic CSV structure validation using existing validator on a sample
          const preview: Partial<OHLCData>[] = data.slice(0, 50).map((row) => ({
            date: new Date(String(row.date || row.Date || row.DATE || '')),
            open: Number(row.open ?? row.Open ?? row.OPEN ?? NaN),
            high: Number(row.high ?? row.High ?? row.HIGH ?? NaN),
            low: Number(row.low ?? row.Low ?? row.LOW ?? NaN),
            close: Number(row.close ?? row.Close ?? row.CLOSE ?? NaN),
            volume: Number(row.volume ?? row.Volume ?? row.VOLUME ?? 0),
          }));
          const basic = validateOHLCData(preview);
          if (!basic.isValid) {
            reject(new Error(Array.isArray(basic.errors) ? (basic.errors as any[])[0]?.message || 'Invalid CSV' : 'Invalid CSV'));
            return;
          }

          // Try to detect 'Adj Close' header to adjust prices per row if provided
          const lowerHeaders = headers.map(h => h.toLowerCase());
          const adjCloseIndex = lowerHeaders.findIndex(h => h.includes('adj') && h.includes('close'));
          const adjCloseHeader: string | null = adjCloseIndex >= 0 ? headers[adjCloseIndex] : null;

          // Convert to OHLC format
          const ohlcData: OHLCData[] = data.map((row: Record<string, unknown>) => {
            const dateStr = String((row as any).date ?? (row as any).Date ?? (row as any).DATE ?? '');
            const dateResult = parseDate(dateStr);
            if (!dateResult.isValid || !dateResult.date) {
              throw new Error(`Invalid date format in row: ${JSON.stringify(row)}`);
            }

            const open = validateNumber(row.open || row.Open || row.OPEN) || 0;
            const high = validateNumber(row.high || row.High || row.HIGH) || 0;
            const low = validateNumber(row.low || row.Low || row.LOW) || 0;
            const close = validateNumber(row.close || row.Close || row.CLOSE) || 0;
            const volume = validateNumber(row.volume || row.Volume || row.VOLUME) || 0;
            const adjClose = adjCloseHeader ? validateNumber((row as any)[adjCloseHeader]) : null;

            // If Adj Close provided and valid, rescale OHLC to adjusted values for split-aware history
            if (typeof adjClose === 'number' && isFinite(adjClose) && adjClose > 0 && close > 0) {
              const factor = adjClose / close;
              return {
                date: dateResult.date,
                open: open * factor,
                high: high * factor,
                low: low * factor,
                close: close * factor,
                adjClose: adjClose,
                // Leave volume as-is; many providers' adj close may include dividend adjustments
                volume: volume || 0,
              } as OHLCData;
            }

            return {
              date: dateResult.date,
              open,
              high,
              low,
              close,
              volume: volume || 0,
            } as OHLCData;
          });

          resolve(ohlcData);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to parse CSV'));
        }
      },
      error: (error: PapaParseError) => {
        reject(new Error(error.message));
      },
    });
  });
}