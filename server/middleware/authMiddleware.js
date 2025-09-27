import { authenticateToken } from '../services/authService.js';

function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1].trim();
    }
    if (parts.length === 1 && authHeader.trim()) {
      return authHeader.trim();
    }
  }
  const headerToken = req.headers['x-auth-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  if (req.body && typeof req.body.token === 'string') {
    return req.body.token.trim();
  }
  return null;
}

export async function attachUserIfPresent(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      req.authToken = null;
      req.rawAuthToken = null;
      return next();
    }
    const { user, token: tokenRecord } = await authenticateToken(token);
    req.user = user;
    req.authToken = tokenRecord;
    req.rawAuthToken = token;
    return next();
  } catch (err) {
    req.user = null;
    req.authToken = null;
    req.rawAuthToken = null;
    req.authError = err;
    return next();
  }
}

export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const { user, token: tokenRecord } = await authenticateToken(token);
    req.user = user;
    req.authToken = tokenRecord;
    req.rawAuthToken = token;
    return next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message || 'Недействительный токен' });
  }
}

