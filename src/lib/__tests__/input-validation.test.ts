import { describe, it, expect } from 'vitest';
import {
  sanitizeNumericInput,
  sanitizeTextInput,
  sanitizeFileName,
  VALIDATION_CONSTRAINTS
} from '../input-validation';

describe('Input Validation', () => {
  describe('sanitizeNumericInput', () => {
    it('should sanitize valid numeric inputs', () => {
      expect(sanitizeNumericInput('123')).toBe(123);
      expect(sanitizeNumericInput('123.45')).toBe(123.45);
      expect(sanitizeNumericInput('-123')).toBe(-123);
      expect(sanitizeNumericInput('0')).toBe(0);
      expect(sanitizeNumericInput('0.001')).toBe(0.001);
    });

    it('should remove invalid characters', () => {
      expect(sanitizeNumericInput('123abc')).toBe(123);
      expect(sanitizeNumericInput('12.34.56')).toBe(12.3456);
      expect(sanitizeNumericInput('--123')).toBe(-123);
      expect(sanitizeNumericInput('1++23')).toBe(123);
      expect(sanitizeNumericInput('12e34')).toBe(1234);
    });

    it('should handle edge cases', () => {
      expect(sanitizeNumericInput('')).toBe(0); // fallback
      expect(sanitizeNumericInput('.')).toBe(0); // fallback
      expect(sanitizeNumericInput('-')).toBe(0); // fallback
      expect(sanitizeNumericInput('abc')).toBe(0); // fallback
      expect(sanitizeNumericInput('   123   ')).toBe(123);
    });

    it('should handle scientific notation by removing letters', () => {
      expect(sanitizeNumericInput('1.23e-4')).toBe(1.234);
      expect(sanitizeNumericInput('1E5')).toBe(15);
    });

    it('should handle very long numeric strings', () => {
      const longNumber = '1'.repeat(100);
      const result = sanitizeNumericInput(longNumber);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('sanitizeTextInput', () => {
    it('should sanitize basic text inputs', () => {
      expect(sanitizeTextInput('Hello World')).toBe('Hello World');
      expect(sanitizeTextInput('Test123')).toBe('Test123');
      expect(sanitizeTextInput('Valid-Text_Input')).toBe('Valid-Text_Input');
    });

    it('should remove dangerous characters', () => {
      expect(sanitizeTextInput('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitizeTextInput('Hello<>World')).toBe('HelloWorld');
      expect(sanitizeTextInput('Test&amp;Text')).toBe('TestampText');
    });

    it('should handle SQL injection patterns', () => {
      expect(sanitizeTextInput("'; DROP TABLE users; --")).toBe("' DROP TABLE users --");
      expect(sanitizeTextInput('1\' OR \'1\'=\'1')).toBe('1\' OR \'1\'\'1');
    });

    it('should preserve allowed special characters', () => {
      expect(sanitizeTextInput('Test@email.com')).toBe('Test@email.com');
      expect(sanitizeTextInput('Price: $123.45')).toBe('Price $123.45');
      expect(sanitizeTextInput('100% Success')).toBe('100% Success');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeTextInput('Тест')).toBe('Тест');
      expect(sanitizeTextInput('测试')).toBe('测试');
      expect(sanitizeTextInput('🚀 Rocket')).toBe('🚀 Rocket');
    });

    it('should trim whitespace', () => {
      expect(sanitizeTextInput('   Hello World   ')).toBe('Hello World');
      expect(sanitizeTextInput('\n\tTest\n\t')).toBe('Test');
    });

    it('should handle empty and null inputs', () => {
      expect(sanitizeTextInput('')).toBe('');
      expect(sanitizeTextInput('   ')).toBe('');
    });

    it('should respect maximum length', () => {
      const longText = 'a'.repeat(2000);
      const result = sanitizeTextInput(longText);
      expect(result.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('sanitizeFileName', () => {
    it('should sanitize valid file names', () => {
      expect(sanitizeFileName('document.txt')).toBe('document.txt');
      expect(sanitizeFileName('my-file_2024.csv')).toBe('my-file_2024.csv');
      expect(sanitizeFileName('Report 2024.pdf')).toBe('Report 2024.pdf');
    });

    it('should remove dangerous path characters', () => {
      expect(sanitizeFileName('../../../etc/passwd')).toBe('etc_passwd');
      expect(sanitizeFileName('..\\windows\\system32')).toBe('windows_system32');
      expect(sanitizeFileName('/usr/bin/rm')).toBe('usr_bin_rm');
    });

    it('should handle Windows reserved names', () => {
      expect(sanitizeFileName('CON.txt')).toBe('CON_RESERVED.txt');
      expect(sanitizeFileName('PRN.csv')).toBe('PRN_RESERVED.csv');
      expect(sanitizeFileName('AUX.log')).toBe('AUX_RESERVED.log');
      expect(sanitizeFileName('COM1.dat')).toBe('COM1_RESERVED.dat');
    });

    it('should remove forbidden filename characters', () => {
      expect(sanitizeFileName('file<name>.txt')).toBe('file_name_.txt');
      expect(sanitizeFileName('doc|with|pipes.pdf')).toBe('doc_with_pipes.pdf');
      expect(sanitizeFileName('question?.txt')).toBe('question_.txt');
      expect(sanitizeFileName('file"with"quotes.csv')).toBe('file_with_quotes.csv');
    });

    it('should handle multiple dots and leading/trailing dots', () => {
      expect(sanitizeFileName('....file.txt')).toBe('file.txt');
      expect(sanitizeFileName('file.txt....')).toBe('file.txt');
      expect(sanitizeFileName('file..name.txt')).toBe('file.name.txt');
    });

    it('should enforce reasonable length limits', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result.endsWith('.txt')).toBe(true);
    });

    it('should preserve file extensions', () => {
      expect(sanitizeFileName('dangerous/file.exe')).toBe('dangerous_file.exe');
      expect(sanitizeFileName('script<>file.js')).toBe('script_file.js');
    });

    it('should handle files without extensions', () => {
      expect(sanitizeFileName('README')).toBe('README');
      expect(sanitizeFileName('config/file')).toBe('config_file');
    });

    it('should handle edge cases', () => {
      expect(sanitizeFileName('')).toBe('unnamed_file');
      expect(sanitizeFileName('   ')).toBe('unnamed_file');
      expect(sanitizeFileName('...')).toBe('unnamed_file');
      expect(sanitizeFileName('/')).toBe('unnamed_file');
    });
  });

  describe('VALIDATION_CONSTRAINTS', () => {
    it('should have reasonable numeric constraints', () => {
      expect(VALIDATION_CONSTRAINTS.NUMERIC.MIN_VALUE).toBeDefined();
      expect(VALIDATION_CONSTRAINTS.NUMERIC.MAX_VALUE).toBeDefined();
      expect(VALIDATION_CONSTRAINTS.NUMERIC.MAX_DECIMAL_PLACES).toBeDefined();
      
      expect(typeof VALIDATION_CONSTRAINTS.NUMERIC.MIN_VALUE).toBe('number');
      expect(typeof VALIDATION_CONSTRAINTS.NUMERIC.MAX_VALUE).toBe('number');
      expect(typeof VALIDATION_CONSTRAINTS.NUMERIC.MAX_DECIMAL_PLACES).toBe('number');
      
      expect(VALIDATION_CONSTRAINTS.NUMERIC.MIN_VALUE).toBeLessThan(VALIDATION_CONSTRAINTS.NUMERIC.MAX_VALUE);
      expect(VALIDATION_CONSTRAINTS.NUMERIC.MAX_DECIMAL_PLACES).toBeGreaterThan(0);
    });

    it('should have reasonable text constraints', () => {
      expect(VALIDATION_CONSTRAINTS.TEXT.MAX_LENGTH).toBeDefined();
      expect(VALIDATION_CONSTRAINTS.TEXT.MIN_LENGTH).toBeDefined();
      
      expect(typeof VALIDATION_CONSTRAINTS.TEXT.MAX_LENGTH).toBe('number');
      expect(typeof VALIDATION_CONSTRAINTS.TEXT.MIN_LENGTH).toBe('number');
      
      expect(VALIDATION_CONSTRAINTS.TEXT.MIN_LENGTH).toBeLessThan(VALIDATION_CONSTRAINTS.TEXT.MAX_LENGTH);
      expect(VALIDATION_CONSTRAINTS.TEXT.MAX_LENGTH).toBeGreaterThan(0);
    });

    it('should have filename constraints', () => {
      expect(VALIDATION_CONSTRAINTS.FILENAME.MAX_LENGTH).toBeDefined();
      expect(typeof VALIDATION_CONSTRAINTS.FILENAME.MAX_LENGTH).toBe('number');
      expect(VALIDATION_CONSTRAINTS.FILENAME.MAX_LENGTH).toBeGreaterThan(0);
      expect(VALIDATION_CONSTRAINTS.FILENAME.MAX_LENGTH).toBeLessThanOrEqual(255);
    });

    it('should have IBS specific constraints', () => {
      expect(VALIDATION_CONSTRAINTS.IBS).toBeDefined();
      expect(VALIDATION_CONSTRAINTS.IBS.MIN).toBe(0);
      expect(VALIDATION_CONSTRAINTS.IBS.MAX).toBe(1);
      expect(VALIDATION_CONSTRAINTS.IBS.MIN).toBeLessThan(VALIDATION_CONSTRAINTS.IBS.MAX);
    });

    it('should have reasonable percentage constraints', () => {
      expect(VALIDATION_CONSTRAINTS.PERCENTAGE).toBeDefined();
      expect(VALIDATION_CONSTRAINTS.PERCENTAGE.MIN).toBeGreaterThanOrEqual(0);
      expect(VALIDATION_CONSTRAINTS.PERCENTAGE.MAX).toBeGreaterThan(VALIDATION_CONSTRAINTS.PERCENTAGE.MIN);
    });
  });

  describe('Security Tests', () => {
    it('should prevent path traversal attacks', () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      maliciousNames.forEach(name => {
        const sanitized = sanitizeFileName(name);
        expect(sanitized).not.toContain('../');
        expect(sanitized).not.toContain('..\\');
        expect(sanitized).not.toContain('/etc/');
        expect(sanitized).not.toContain('\\windows\\');
      });
    });

    it('should prevent XSS in text inputs', () => {
      const xssInputs = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(\'xss\')">',
        '<svg onload="alert(\'xss\')">',
        '"><script>alert("xss")</script>'
      ];

      xssInputs.forEach(input => {
        const sanitized = sanitizeTextInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<svg');
      });
    });

    it('should prevent SQL injection patterns', () => {
      const sqlInjections = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1'; INSERT INTO users VALUES (1,'admin','admin'); --",
        "' UNION SELECT * FROM passwords --"
      ];

      sqlInjections.forEach(injection => {
        const sanitized = sanitizeTextInput(injection);
        // Only semicolons and other dangerous chars are removed by our basic sanitization
        expect(sanitized).not.toContain(';');
        expect(sanitized.length).toBeLessThanOrEqual(injection.length);
      });
    });
  });
});