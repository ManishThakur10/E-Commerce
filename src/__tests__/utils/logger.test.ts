import { sanitizeLog } from '../../utils/logger';

describe('Logger Utils', () => {
  describe('sanitizeLog', () => {
    it('should redact sensitive keys', () => {
      const data = {
        apiKey: 'secret123',
        username: 'john',
        password: 'password123',
        token: 'bearer-token',
      };

      const sanitized = sanitizeLog(data);

      expect(sanitized.apiKey).toBe('***REDACTED***');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.token).toBe('***REDACTED***');
      expect(sanitized.username).toBe('john');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John',
          api_key: 'secret',
        },
        settings: {
          timeout: 5000,
        },
      };

      const sanitized = sanitizeLog(data);

      expect(sanitized.user.name).toBe('John');
      expect(sanitized.user.api_key).toBe('***REDACTED***');
      expect(sanitized.settings.timeout).toBe(5000);
    });

    it('should handle non-object values', () => {
      expect(sanitizeLog('string')).toBe('string');
      expect(sanitizeLog(123)).toBe(123);
      expect(sanitizeLog(null)).toBe(null);
      expect(sanitizeLog(undefined)).toBe(undefined);
    });
  });
});
