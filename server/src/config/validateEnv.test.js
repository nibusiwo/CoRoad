const { hasRealValue } = require('./validateEnv');

describe('validateEnv helpers', () => {
  test('rejects empty and placeholder values', () => {
    expect(hasRealValue('')).toBe(false);
    expect(hasRealValue('your_app_id')).toBe(false);
    expect(hasRealValue('example-secret')).toBe(false);
  });

  test('accepts real-looking values', () => {
    expect(hasRealValue('wx1234567890abcdef')).toBe(true);
    expect(hasRealValue('SMS_123456')).toBe(true);
  });
});
