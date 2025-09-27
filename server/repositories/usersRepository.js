import { randomUUID } from 'crypto';
import { isDbReady, query } from '../db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    nickname: row.nickname,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  };
}

export function toPublicUser(user) {
  if (!user) return null;
  const { id, email, nickname, createdAt, updatedAt, lastLoginAt } = user;
  return { id, email, nickname, createdAt, updatedAt, lastLoginAt };
}

export async function ensureUserTable() {
  if (!isDbReady()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      nickname TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_nickname ON users (LOWER(nickname));
  `);
  return true;
}

export async function createUser({ email, passwordHash, passwordSalt, nickname }) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const id = randomUUID();
  const result = await query(`
    INSERT INTO users (id, email, password_hash, password_salt, nickname)
    VALUES ($1, LOWER($2), $3, $4, $5)
    RETURNING id, email, password_hash, password_salt, nickname, created_at, updated_at, last_login_at;
  `, [id, email, passwordHash, passwordSalt, nickname]);
  return mapRow(result.rows?.[0]);
}

export async function findUserByEmail(email) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(`
    SELECT id, email, password_hash, password_salt, nickname, created_at, updated_at, last_login_at
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1;
  `, [email]);
  return mapRow(result.rows?.[0]);
}

export async function getUserById(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const result = await query(`
    SELECT id, email, password_hash, password_salt, nickname, created_at, updated_at, last_login_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `, [id]);
  return mapRow(result.rows?.[0]);
}

export async function updateLastLogin(id) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  await query(`
    UPDATE users
    SET last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1;
  `, [id]);
}

export async function touchProfile(id, patch = {}) {
  if (!isDbReady()) throw new Error('Хранилище пользователей недоступно');
  const fields = [];
  const values = [];
  let idx = 1;
  if (patch.nickname) {
    fields.push(`nickname = $${idx += 1}`);
    values.push(patch.nickname);
  }
  if (!fields.length) return null;
  values.unshift(id);
  const result = await query(`
    UPDATE users
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1
    RETURNING id, email, password_hash, password_salt, nickname, created_at, updated_at, last_login_at;
  `, values);
  return mapRow(result.rows?.[0]);
}
