import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';

const TOKEN_TTL_MS = Math.max(1000 * 60 * 60 * 24, Number(process.env.AUTH_TOKEN_TTL_MS) || 1000 * 60 * 60 * 24 * 30);
const KEY_LENGTH = 64;
let secretCache = null;
let warnedAboutSecret = false;

function getSecret() {
  if (secretCache) return secretCache;
  const candidate = process.env.AUTH_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY;
  if (!candidate && !warnedAboutSecret) {
    console.warn('[authService] AUTH_SECRET не задан, используется небезопасный dev-secret');
    warnedAboutSecret = true;
  }
  secretCache = candidate || 'dev-secret-change-me';
  return secretCache;
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

function toBase64Url(data) {
  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8').toString('base64url');
  }
  return Buffer.from(data).toString('base64url');
}

function parseBase64Url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('Пароль не может быть пустым');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return {
    hash: derived.toString('hex'),
    salt: salt.toString('hex'),
  };
}

export async function verifyPassword(password, hash, salt) {
  if (typeof password !== 'string' || !password) return false;
  if (!hash || !salt) return false;
  const derived = await scrypt(password, Buffer.from(salt, 'hex'));
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

export function issueToken(user, { expiresInMs } = {}) {
  if (!user?.id) throw new Error('Невозможно выдать токен без пользователя');
  const now = Date.now();
  const ttl = Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : TOKEN_TTL_MS;
  const payload = {
    sub: user.id,
    email: user.email,
    nickname: user.nickname,
    iat: now,
    exp: now + ttl,
    v: 1,
  };
  const header = {
    alg: 'HS256',
    typ: 'EOGJWT',
    v: 1,
  };
  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', getSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Токен не задан');
  }
  const cleaned = token.trim();
  const parts = cleaned.split('.');
  if (parts.length !== 3) {
    throw new Error('Некорректный формат токена');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const unsigned = `${headerPart}.${payloadPart}`;
  const expectedSignature = createHmac('sha256', getSecret()).update(unsigned).digest();
  const providedSignature = Buffer.from(signaturePart, 'base64url');
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    throw new Error('Подпись токена недействительна');
  }
  let payload;
  try {
    payload = JSON.parse(parseBase64Url(payloadPart));
  } catch {
    throw new Error('Невозможно разобрать нагрузку токена');
  }
  if (payload.exp && Date.now() > Number(payload.exp)) {
    throw new Error('Срок действия токена истёк');
  }
  return payload;
}

export function getDefaultTokenTtl() {
  return TOKEN_TTL_MS;
}
