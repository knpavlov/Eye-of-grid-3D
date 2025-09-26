import { randomUUID } from 'crypto';
import { isDbReady, query } from '../db.js';

function mapToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    label: row.label || null,
  };
}

export async function ensureAuthTokensTable() {
  if (!isDbReady()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
  `);
  return true;
}

export async function createTokenRecord({ userId, tokenHash, expiresAt, label }) {
  if (!isDbReady()) throw new Error('Хранилище токенов недоступно');
  const id = randomUUID();
  const result = await query(`
    INSERT INTO auth_tokens (id, user_id, token_hash, expires_at, label)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, token_hash, created_at, last_used_at, expires_at, label;
  `, [id, userId, tokenHash, expiresAt, label || null]);
  return mapToken(result.rows?.[0]);
}

export async function findTokenByHash(tokenHash) {
  if (!isDbReady()) throw new Error('Хранилище токенов недоступно');
  if (!tokenHash) return null;
  const result = await query(`
    SELECT id, user_id, token_hash, created_at, last_used_at, expires_at, label
    FROM auth_tokens
    WHERE token_hash = $1
    LIMIT 1;
  `, [tokenHash]);
  return mapToken(result.rows?.[0]);
}

export async function touchTokenUsage(id) {
  if (!isDbReady() || !id) return false;
  await query(`
    UPDATE auth_tokens
    SET last_used_at = NOW()
    WHERE id = $1;
  `, [id]);
  return true;
}

export async function deleteTokenById(id) {
  if (!isDbReady() || !id) return false;
  const result = await query(`
    DELETE FROM auth_tokens WHERE id = $1;
  `, [id]);
  const affected = typeof result.rowCount === 'number' ? result.rowCount : Number(result.rowCount || 0);
  return affected > 0;
}

export async function deleteTokensForUser(userId) {
  if (!isDbReady() || !userId) return 0;
  const result = await query(`
    DELETE FROM auth_tokens WHERE user_id = $1;
  `, [userId]);
  return typeof result.rowCount === 'number' ? result.rowCount : Number(result.rowCount || 0);
}

