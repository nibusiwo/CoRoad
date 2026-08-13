const jwt = require('jsonwebtoken');
const config = require('../config');
const { getBearerToken, getTokenFromRequest, verifySocketToken } = require('./wsAuth');

describe('wsAuth', () => {
  test('extracts bearer tokens from headers and raw values', () => {
    expect(getBearerToken('Bearer abc')).toBe('abc');
    expect(getBearerToken('abc')).toBe('abc');
    expect(getBearerToken('')).toBeNull();
  });

  test('extracts token from websocket query string', () => {
    const req = { url: '/ws?token=query-token', headers: {} };
    expect(getTokenFromRequest(req)).toBe('query-token');
  });

  test('verifies JWT and rejects missing token', () => {
    const token = jwt.sign({ userId: 123, phone: '13800138000' }, config.jwt.secret);
    expect(verifySocketToken(token).userId).toBe(123);
    expect(() => verifySocketToken(null)).toThrow('WebSocket auth token is required');
  });
});
