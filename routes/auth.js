import { Router } from 'express';
import { hashPassword, verifyPassword } from '../server/services/authService.js';
import { createAuthPayload, toClientProfile } from '../server/services/sessionService.js';
import {
  createUser,
  findUserByEmail,
  updateLastLogin,
  ensureUserTable,
} from '../server/repositories/usersRepository.js';
import { requireAuth } from '../server/middleware/authMiddleware.js';

const router = Router();
let storageReady = false;

function sanitizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function sanitizeNickname(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Ник обязателен');
  }
  const safe = raw.trim();
  return safe.length > 32 ? safe.slice(0, 32) : safe;
}

function validatePassword(password) {
  if (typeof password !== 'string' || !password.trim()) {
    throw new Error('Пароль обязателен');
  }
  if (password.length < 6) {
    throw new Error('Пароль должен содержать не менее 6 символов');
  }
}

async function ensureStorage() {
  if (storageReady) return true;
  const ok = await ensureUserTable();
  storageReady = ok;
  return ok;
}

router.post('/register', async (req, res) => {
  try {
    const ready = await ensureStorage();
    if (!ready) {
      return res.status(503).json({ error: 'Хранилище пользователей недоступно' });
    }
    const email = sanitizeEmail(req.body?.email);
    const password = req.body?.password ?? '';
    const confirm = req.body?.confirm ?? req.body?.passwordConfirm ?? '';
    try {
      validatePassword(password);
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Пароль не подходит требованиям' });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: 'Пароли не совпадают' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }
    let nickname;
    try {
      nickname = sanitizeNickname(req.body?.nickname);
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Ник обязателен' });
    }
    const { hash, salt } = await hashPassword(password);
    const user = await createUser({ email, passwordHash: hash, passwordSalt: salt, nickname });
    const payload = createAuthPayload(user);
    res.status(201).json(payload);
  } catch (err) {
    console.error('[auth] Регистрация завершилась ошибкой', err);
    res.status(500).json({ error: 'Не удалось создать пользователя' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const ready = await ensureStorage();
    if (!ready) {
      return res.status(503).json({ error: 'Хранилище пользователей недоступно' });
    }
    const email = sanitizeEmail(req.body?.email);
    const password = req.body?.password ?? '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Неверные учетные данные' });
    }
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    await updateLastLogin(user.id);
    const payload = createAuthPayload(user);
    res.json(payload);
  } catch (err) {
    console.error('[auth] Ошибка входа', err);
    res.status(500).json({ error: 'Не удалось выполнить вход' });
  }
});

router.get('/profile', requireAuth, (req, res) => {
  res.json({ user: toClientProfile(req.user) });
});

export default router;
