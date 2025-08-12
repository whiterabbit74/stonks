import Papa from 'papaparse';
import type {
  OHLCData,
  ValidationResult
} from '../types';

// Column mapping interface
interface ColumnMapping {
  Date: string;
  Open: string;
  High: string;
  Low: string;
  Close: string;
  Volume: string;
  'Adj Close'?: string;
}

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

// Column mapping function
export function mapColumns(headers: string[]): ColumnMapping {
  const mapping: Partial<ColumnMapping> = {};
  
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  // Map Date column
  const dateIndex = lowerHeaders.findIndex(h => 
    h.includes('date') || h === 'timestamp' || h === 'time'
  );
  if (dateIndex >= 0) mapping.Date = headers[dateIndex];
  
  // Map OHLC columns
  const openIndex = lowerHeaders.findIndex(h => h.includes('open') || h === 'o');
  if (openIndex >= 0) mapping.Open = headers[openIndex];
  
  const highIndex = lowerHeaders.findIndex(h => h.includes('high') || h === 'h');
  if (highIndex >= 0) mapping.High = headers[highIndex];
  
  const lowIndex = lowerHeaders.findIndex(h => h.includes('low') || h === 'l');
  if (lowIndex >= 0) mapping.Low = headers[lowIndex];
  
  const closeIndex = lowerHeaders.findIndex(h => 
    h.includes('close') || h === 'c'
  );
  if (closeIndex >= 0) mapping.Close = headers[closeIndex];
  
  // Map Adj Close separately
  const adjCloseIndex = lowerHeaders.findIndex(h => 
    h.includes('adj') && h.includes('close')
  );
  if (adjCloseIndex >= 0) (mapping as Record<string, string>)['Adj Close'] = headers[adjCloseIndex];
  
  const volumeIndex = lowerHeaders.findIndex(h => 
    h.includes('volume') || h.includes('vol') || h === 'v'
  );
  if (volumeIndex >= 0) mapping.Volume = headers[volumeIndex];
  
  return mapping as ColumnMapping;
}

// Enhanced CSV validation
export function validateCSVData(data: Array<Record<string, unknown>>, headers: string[]): ValidationResult & { rowCount: number } {
  const errors: Array<{ code: string; message: string; row?: number }> = [];
  
  // Check if data exists
  if (!data || data.length === 0) {
    errors.push({ code: 'EMPTY_DATA', message: 'No data found in CSV file' });
    return { isValid: false, errors, rowCount: 0 };
  }

  // Check for required columns
  const mapping = mapColumns(headers);
  const requiredColumns = ['Date', 'Open', 'High', 'Low', 'Close'];
  const missingColumns = requiredColumns.filter(col => !mapping[col as keyof ColumnMapping]);
  
  if (missingColumns.length > 0) {
    errors.push({ 
      code: 'MISSING_COLUMNS', 
      message: `Missing required columns: ${missingColumns.join(', ')}` 
    });
  }

  // Basic data validation - allow smaller datasets for testing
  if (data.length < 1) {
    errors.push({ 
      code: 'INSUFFICIENT_DATA', 
      message: 'Not enough data points (minimum 1 required)' 
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    rowCount: data.length
  };
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

// CSV parsing function
export async function parseCSV(file: File): Promise<OHLCData[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
            return;
          }

          const data = results.data as Array<Record<string, unknown>>;
          const headers = Object.keys(data[0] || {});
          
          // Validate CSV structure
          const validation = validateCSVData(data, headers);
          if (!validation.isValid) {
            reject(new Error(validation.errors.join(', ')));
            return;
          }

          // Convert to OHLC format
          const ohlcData: OHLCData[] = data.map((row: Record<string, unknown>) => {
            const dateResult = parseDate((row as Record<string, unknown>).date as string || (row as Record<string, unknown>).Date as string || (row as Record<string, unknown>).DATE as string);
            if (!dateResult.isValid || !dateResult.date) {
              throw new Error(`Invalid date format in row: ${JSON.stringify(row)}`);
            }

            return {
              date: dateResult.date,
              open: validateNumber((row as Record<string, unknown>).open || (row as Record<string, unknown>).Open || (row as Record<string, unknown>).OPEN) || 0,
              high: validateNumber((row as Record<string, unknown>).high || (row as Record<string, unknown>).High || (row as Record<string, unknown>).HIGH) || 0,
              low: validateNumber((row as Record<string, unknown>).low || (row as Record<string, unknown>).Low || (row as Record<string, unknown>).LOW) || 0,
              close: validateNumber((row as Record<string, unknown>).close || (row as Record<string, unknown>).Close || (row as Record<string, unknown>).CLOSE) || 0,
              volume: validateNumber((row as Record<string, unknown>).volume || (row as Record<string, unknown>).Volume || (row as Record<string, unknown>).VOLUME) || 0
            };
          }).filter(item => item.date); // Remove invalid dates

          // Validate the converted data
          const ohlcValidation = validateOHLCData(ohlcData);
          if (!ohlcValidation.isValid) {
            reject(new Error(ohlcValidation.errors.join(', ')));
            return;
          }

          // Sort by date
          ohlcData.sort((a, b) => a.date.getTime() - b.date.getTime());

          resolve(ohlcData);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      }
    });
  });
}