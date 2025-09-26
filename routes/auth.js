import { Router } from 'express';
import { optionalAuth, requireAuth } from '../server/middleware/auth.js';
import { authenticateUser, invalidateToken, registerUser } from '../server/services/authService.js';

const router = Router();

function normalizeEmailInput(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, passwordConfirm, displayName } = req.body || {};
    const normalizedEmail = normalizeEmailInput(email);
    const result = await registerUser({
      email: normalizedEmail,
      password,
      passwordConfirm,
      displayName,
    });
    res.status(201).json({ token: result.token, user: result.user, expiresAt: result.expiresAt });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось создать пользователя' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmailInput(email);
    const result = await authenticateUser(normalizedEmail, password, { label: 'login' });
    res.json({ token: result.token, user: result.user, expiresAt: result.expiresAt });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось выполнить вход' });
  }
});

router.get('/profile', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.authToken) {
      await invalidateToken(req.authToken);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Не удалось завершить сессию' });
  }
});

export default router;

