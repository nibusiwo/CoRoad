const jwt = require('jsonwebtoken');
const config = require('../config');

function getBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('Bearer ') ? trimmed.slice(7).trim() : trimmed;
}

function getTokenFromRequest(req) {
  const fromHeader = getBearerToken(req.headers?.authorization);
  if (fromHeader) return fromHeader;

  try {
    const url = new URL(req.url || '', 'http://localhost');
    return getBearerToken(url.searchParams.get('token'));
  } catch (_) {
    return null;
  }
}

function verifySocketToken(token) {
  if (!token) {
    const err = new Error('WebSocket auth token is required');
    err.code = 'WS_AUTH_REQUIRED';
    throw err;
  }

  const decoded = jwt.verify(token, config.jwt.secret);
  if (!decoded?.userId) {
    const err = new Error('WebSocket auth token is invalid');
    err.code = 'WS_AUTH_INVALID';
    throw err;
  }
  return decoded;
}

function attachSocketUser(ws, token) {
  const decoded = verifySocketToken(token);
  ws.userId = decoded.userId;
  ws.userPhone = decoded.phone || null;
  ws.isAuthenticated = true;
  return decoded;
}

module.exports = {
  getBearerToken,
  getTokenFromRequest,
  verifySocketToken,
  attachSocketUser,
};
