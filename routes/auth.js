import { Router } from 'express';
import { registerUser, loginUser, authenticateToken, revokeToken } from '../server/services/authService.js';
import { requireAuth, attachUserIfPresent } from '../server/middleware/authMiddleware.js';

const router = Router();

function normalizeProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function buildAuthResponse({ user, token, expiresAt }) {
  return {
    token,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    user: normalizeProfile(user),
  };
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, repeatPassword, displayName } = req.body || {};
    if (password !== repeatPassword) {
      return res.status(400).json({ error: 'Пароли не совпадают' });
    }
    const result = await registerUser({ email, password, displayName });
    res.status(201).json(buildAuthResponse(result));
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось создать пользователя' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await loginUser({ email, password });
    res.json(buildAuthResponse(result));
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось выполнить вход' });
  }
});

router.get('/me', attachUserIfPresent, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  res.json({ user: normalizeProfile(req.user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    const token = req.rawAuthToken;
    if (token) {
      await revokeToken(token);
    }
    res.json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось выполнить выход' });
  }
});

router.post('/token/verify', async (req, res) => {
  try {
    const { token } = req.body || {};
    const result = await authenticateToken(token);
    res.json({ user: normalizeProfile(result.user), expiresAt: result.token?.expiresAt || null });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Токен недействителен' });
  }
});

export default router;

