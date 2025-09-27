import { randomUUID, createHash } from 'crypto';
import { isDbReady, query } from '../db.js';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.displayname || row.email?.split('@')[0] || 'Player',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function mapToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    label: row.label || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

export async function ensureUserTables() {
  if (!isDbReady()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      UNIQUE(token_hash)
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_user_tokens_expires ON user_tokens(expires_at);
  `);
  return true;
}

export async function createUser({ email, passwordHash, displayName }) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const id = randomUUID();
  const result = await query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, display_name, created_at, updated_at;`,
    [id, email, passwordHash, displayName || '']
  );
  return mapUser(result.rows?.[0]);
}

export async function getUserByEmail(email) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(
    `SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE email = $1 LIMIT 1;`,
    [email]
  );
  if (!result.rows?.length) return null;
  const row = result.rows[0];
  const user = mapUser(row);
  return { ...user, passwordHash: row.password_hash };
}

export async function getUserById(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(
    `SELECT id, email, display_name, created_at, updated_at FROM users WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return mapUser(result.rows?.[0]);
}

export async function updateUserDisplayName(id, displayName) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(
    `UPDATE users SET display_name = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, display_name, created_at, updated_at;`,
    [id, displayName || '']
  );
  return mapUser(result.rows?.[0]);
}

export async function createTokenRecord({ userId, tokenHash, label = '', expiresAt }) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const id = randomUUID();
  const result = await query(
    `INSERT INTO user_tokens (id, user_id, token_hash, label, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, token_hash, label, created_at, last_used_at, expires_at;`,
    [id, userId, tokenHash, label || '', expiresAt]
  );
  return mapToken(result.rows?.[0]);
}

export async function touchToken(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(
    `UPDATE user_tokens SET last_used_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, token_hash, label, created_at, last_used_at, expires_at;`,
    [id]
  );
  return mapToken(result.rows?.[0]);
}

export async function deleteToken(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(`DELETE FROM user_tokens WHERE id = $1;`, [id]);
  return typeof result.rowCount === 'number' ? result.rowCount > 0 : Number(result.rowCount || 0) > 0;
}

export async function deleteTokenByHash(tokenHash) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(`DELETE FROM user_tokens WHERE token_hash = $1;`, [tokenHash]);
  return typeof result.rowCount === 'number' ? result.rowCount > 0 : Number(result.rowCount || 0) > 0;
}

export async function findToken(tokenHash) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(
    `SELECT t.id, t.user_id, t.token_hash, t.label, t.created_at, t.last_used_at, t.expires_at,
            u.email, u.display_name, u.created_at AS user_created_at, u.updated_at AS user_updated_at
     FROM user_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1
     LIMIT 1;`,
    [tokenHash]
  );
  if (!result.rows?.length) return null;
  const row = result.rows[0];
  const token = mapToken(row);
  const user = mapUser({
    id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    created_at: row.user_created_at,
    updated_at: row.user_updated_at,
  });
  return { token, user };
}

export async function purgeExpiredTokens(now = new Date()) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(`DELETE FROM user_tokens WHERE expires_at < $1;`, [now]);
  return typeof result.rowCount === 'number' ? result.rowCount : Number(result.rowCount || 0);
}

export function hashTokenValue(token) {
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex');
}

