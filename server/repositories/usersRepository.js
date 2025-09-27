import { randomUUID } from 'crypto';
import { isDbReady, query } from '../db.js';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    passwordHash: row.password_hash || null,
    passwordSalt: row.password_salt || null,
  };
}

export async function ensureUsersTable() {
  if (!isDbReady()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
  `);
  return true;
}

export async function createUser({ email, displayName, passwordHash, passwordSalt }) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const id = randomUUID();
  const result = await query(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, email, display_name, password_hash, password_salt, created_at, updated_at;
  `, [id, email, displayName || null, passwordHash, passwordSalt]);
  return mapUser(result.rows?.[0]);
}

export async function findUserByEmail(email) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const normalized = typeof email === 'string' ? email.trim() : '';
  if (!normalized) return null;
  const result = await query(`
    SELECT id, email, display_name, password_hash, password_salt, created_at, updated_at
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1;
  `, [normalized]);
  return mapUser(result.rows?.[0]);
}

export async function getUserById(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  if (!id) return null;
  const result = await query(`
    SELECT id, email, display_name, password_hash, password_salt, created_at, updated_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `, [id]);
  return mapUser(result.rows?.[0]);
}

export async function touchUser(id) {
  if (!isDbReady() || !id) return false;
  await query(`
    UPDATE users
    SET updated_at = NOW()
    WHERE id = $1;
  `, [id]);
  return true;
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Player',
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}
