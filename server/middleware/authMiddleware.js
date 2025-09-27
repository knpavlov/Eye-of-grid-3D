import { resolveUserFromToken, toClientProfile } from '../services/sessionService.js';

function pickToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const xAuth = req.headers?.['x-auth-token'] || req.headers?.['x-access-token'];
  const queryToken = req.query?.token || req.query?.authToken;
  return header || xAuth || queryToken || null;
}

export async function attachUser(req, _res, next) {
  if (req.__authAttached) return next();
  req.__authAttached = true;
  const rawToken = pickToken(req);
  const resolved = await resolveUserFromToken(rawToken);
  if (resolved?.user) {
    req.user = toClientProfile(resolved.user);
    req.authToken = resolved.token;
  } else {
    req.user = null;
    req.authToken = null;
  }
  next();
}

export async function requireAuth(req, res, next) {
  await attachUser(req, res, () => {});
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  return next();
}

export default {
  attachUser,
  requireAuth,
};
