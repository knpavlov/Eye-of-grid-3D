import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'crypto';
import { createUser, ensureUsersTable, findUserByEmail, getUserById, sanitizeUser, touchUser } from '../repositories/usersRepository.js';
import {
  createTokenRecord,
  ensureAuthTokensTable,
  findTokenByHash,
  touchTokenUsage,
  deleteTokenById,
} from '../repositories/authTokensRepository.js';

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = 'sha512';
const TOKEN_TTL_DAYS = 180;

function nowPlusDays(days) {
  const ms = Number(days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function derivePassword(password, salt) {
  return pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
}

function safeEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a) || '', 'utf8');
    const bufB = Buffer.from(String(b) || '', 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function ensureAuthStorage() {
  await ensureUsersTable();
  await ensureAuthTokensTable();
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    const err = new Error('Пароль должен содержать не менее 8 символов');
    err.status = 400;
    throw err;
  }
  return password;
}

function buildDisplayName(email, requestedName) {
  if (requestedName && typeof requestedName === 'string' && requestedName.trim()) {
    return requestedName.trim().slice(0, 40);
  }
  if (!email) return 'Player';
  const local = email.split('@')[0] || 'Player';
  return local.slice(0, 40);
}

async function issueTokenForUser(user, { label } = {}) {
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = nowPlusDays(TOKEN_TTL_DAYS);
  await createTokenRecord({
    userId: user.id,
    tokenHash,
    expiresAt,
    label: label || null,
  });
  return { token: rawToken, user: sanitizeUser(user), expiresAt: expiresAt.toISOString() };
}

export async function registerUser({ email, password, passwordConfirm, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error('Некорректный адрес электронной почты');
    err.status = 400;
    throw err;
  }
  if (password !== passwordConfirm) {
    const err = new Error('Пароли не совпадают');
    err.status = 400;
    throw err;
  }
  validatePassword(password);

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const err = new Error('Пользователь с таким email уже существует');
    err.status = 409;
    throw err;
  }

  const salt = randomBytes(16).toString('hex');
  const hash = derivePassword(password, salt);
  const created = await createUser({
    email: normalizedEmail,
    displayName: buildDisplayName(normalizedEmail, displayName),
    passwordHash: hash,
    passwordSalt: salt,
  });
  await touchUser(created.id);
  return issueTokenForUser(created, { label: 'registration' });
}

export async function authenticateUser(email, password, { label } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error('Некорректный адрес электронной почты');
    err.status = 400;
    throw err;
  }
  validatePassword(password);
  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    const err = new Error('Неверный email или пароль');
    err.status = 401;
    throw err;
  }
  const derived = derivePassword(password, user.passwordSalt);
  if (!safeEqual(derived, user.passwordHash)) {
    const err = new Error('Неверный email или пароль');
    err.status = 401;
    throw err;
  }
  await touchUser(user.id);
  return issueTokenForUser(user, { label: label || 'login' });
}

export async function authenticateToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Токен отсутствует');
    err.status = 401;
    throw err;
  }
  const tokenHash = hashToken(rawToken);
  const record = await findTokenByHash(tokenHash);
  if (!record) {
    const err = new Error('Недействительный токен');
    err.status = 401;
    throw err;
  }
  const now = Date.now();
  const expires = record.expiresAt ? Date.parse(record.expiresAt) : 0;
  if (expires && expires < now) {
    await deleteTokenById(record.id).catch(() => {});
    const err = new Error('Срок действия токена истёк');
    err.status = 401;
    throw err;
  }
  const user = await getUserById(record.userId);
  if (!user) {
    await deleteTokenById(record.id).catch(() => {});
    const err = new Error('Пользователь не найден');
    err.status = 401;
    throw err;
  }
  await Promise.allSettled([
    touchTokenUsage(record.id),
    touchUser(user.id),
  ]);
  return sanitizeUser(user);
}

export async function invalidateToken(rawToken) {
  if (!rawToken) return false;
  try {
    const tokenHash = hashToken(rawToken);
    const record = await findTokenByHash(tokenHash);
    if (!record) return false;
    await deleteTokenById(record.id);
    return true;
  } catch {
    return false;
  }
}

