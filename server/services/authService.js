import { randomBytes, timingSafeEqual, pbkdf2Sync } from 'crypto';
import {
  ensureUserTables,
  createUser,
  getUserByEmail,
  getUserById,
  createTokenRecord,
  findToken,
  touchToken,
  deleteTokenByHash,
  purgeExpiredTokens,
  hashTokenValue,
} from '../repositories/usersRepository.js';

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';
const PASSWORD_SALT_BYTES = 16;
const TOKEN_BYTES = 48;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 дней

async function ensureUsersReady() {
  const ok = await ensureUserTables();
  if (!ok) {
    const err = new Error('Хранилище пользователей недоступно');
    err.status = 503;
    throw err;
  }
}

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== 'string') return null;
  const email = rawEmail.trim().toLowerCase();
  return email || null;
}

function deriveDisplayName(email) {
  if (!email) return 'Player';
  const local = email.split('@')[0];
  return local ? local.slice(0, 32) : 'Player';
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Пароль должен содержать не менее 6 символов');
  }
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString('hex');
  const derived = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString('hex');
  return `pbkdf2$${PASSWORD_ITERATIONS}$${PASSWORD_DIGEST}$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('pbkdf2$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 5) return false;
  const [, iterStr, digest, salt, expected] = parts;
  const iterations = Number(iterStr);
  if (!iterations || !salt || !expected) return false;
  const derived = pbkdf2Sync(password, salt, iterations, expected.length / 2, digest).toString('hex');
  try {
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateTokenValue() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

async function issueTokenForUser(userId, { label = 'default', ttlMs = TOKEN_TTL_MS } = {}) {
  const rawToken = generateTokenValue();
  const tokenHash = hashTokenValue(rawToken);
  const expiresAt = new Date(Date.now() + Math.max(ttlMs, TOKEN_TTL_MS / 2));
  const record = await createTokenRecord({ userId, tokenHash, label, expiresAt });
  return { token: rawToken, record };
}

function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 32);
}

export async function registerUser({ email, password, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error('Укажите корректный email');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 6) {
    const err = new Error('Пароль должен содержать не менее 6 символов');
    err.status = 400;
    throw err;
  }
  await ensureUsersReady();
  const existing = await getUserByEmail(normalizedEmail).catch(() => null);
  if (existing) {
    const err = new Error('Пользователь с таким email уже существует');
    err.status = 409;
    throw err;
  }
  const passwordHash = hashPassword(password);
  const name = sanitizeDisplayName(displayName) || deriveDisplayName(normalizedEmail);
  const user = await createUser({ email: normalizedEmail, passwordHash, displayName: name });
  const { token, record } = await issueTokenForUser(user.id, { label: 'signup' });
  return { user, token, expiresAt: record.expiresAt };
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error('Укажите корректный email');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 6) {
    const err = new Error('Пароль должен содержать не менее 6 символов');
    err.status = 400;
    throw err;
  }
  await ensureUsersReady();
  const existing = await getUserByEmail(normalizedEmail);
  if (!existing) {
    const err = new Error('Неверный email или пароль');
    err.status = 401;
    throw err;
  }
  const valid = verifyPassword(password, existing.passwordHash);
  if (!valid) {
    const err = new Error('Неверный email или пароль');
    err.status = 401;
    throw err;
  }
  const user = {
    id: existing.id,
    email: existing.email,
    displayName: existing.displayName,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };
  const { token, record } = await issueTokenForUser(user.id, { label: 'login' });
  return { user, token, expiresAt: record.expiresAt };
}

export async function authenticateToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Отсутствует токен авторизации');
    err.status = 401;
    throw err;
  }
  await ensureUsersReady();
  await purgeExpiredTokens().catch(() => null);
  const hash = hashTokenValue(rawToken);
  const pair = await findToken(hash);
  if (!pair) {
    const err = new Error('Недействительный токен');
    err.status = 401;
    throw err;
  }
  const now = Date.now();
  const expiresAt = pair.token?.expiresAt ? new Date(pair.token.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt < now) {
    await deleteTokenByHash(hash).catch(() => null);
    const err = new Error('Срок действия токена истёк');
    err.status = 401;
    throw err;
  }
  try { await touchToken(pair.token.id); } catch {}
  const user = await getUserById(pair.user.id).catch(() => pair.user);
  if (!user) {
    const err = new Error('Пользователь не найден');
    err.status = 401;
    throw err;
  }
  return { user, token: pair.token };
}

export async function revokeToken(rawToken) {
  if (!rawToken) return false;
  const hash = hashTokenValue(rawToken);
  if (!hash) return false;
  return deleteTokenByHash(hash);
}

