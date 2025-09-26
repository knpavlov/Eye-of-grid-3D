import { authenticateToken } from '../services/authService.js';

function extractToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  const bodyToken = req.body?.token;
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }
  return null;
}

export function createAuthMiddleware({ required = false } = {}) {
  return async function authMiddleware(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      if (required) {
        return res.status(401).json({ error: 'Необходима авторизация' });
      }
      req.user = null;
      req.authToken = null;
      return next();
    }
    try {
      const user = await authenticateToken(token);
      req.user = user;
      req.authToken = token;
      return next();
    } catch (err) {
      if (required) {
        const status = err.status || 401;
        return res.status(status).json({ error: err.message || 'Ошибка авторизации' });
      }
      req.user = null;
      req.authToken = null;
      return next();
    }
  };
}

export const optionalAuth = createAuthMiddleware({ required: false });
export const requireAuth = createAuthMiddleware({ required: true });

