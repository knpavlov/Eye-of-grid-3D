// Подключение к базе данных PostgreSQL вынесено в отдельный модуль.
// Логика максимально нейтральна, чтобы при необходимости заменить СУБД.
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const PGHOST = process.env.PGHOST;
const PGDATABASE = process.env.PGDATABASE;
const PGUSER = process.env.PGUSER;
const PGPASSWORD = process.env.PGPASSWORD;

const dbConfigured = Boolean(DATABASE_URL || PGHOST || PGDATABASE);
let pool = null;

function buildConfig() {
  if (!dbConfigured) {
    throw new Error('Database connection is not configured');
  }

  const useSsl = (() => {
    const mode = (process.env.PGSSLMODE || '').toLowerCase();
    if (mode === 'disable') return false;
    if (mode === 'allow') return false;
    if (mode === 'prefer') return true;
    if (mode === 'require') return true;
    if (typeof process.env.NODE_ENV === 'string') {
      return process.env.NODE_ENV.toLowerCase() === 'production';
    }
    return Boolean(process.env.DATABASE_SSL);
  })();

  if (DATABASE_URL) {
    return {
      connectionString: DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PGPOOL_MAX || 10),
    };
  }

  return {
    host: PGHOST || 'localhost',
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    port: Number(process.env.PGPORT || 5432),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PGPOOL_MAX || 10),
  };
}

function getPool() {
  if (!pool) {
    const config = buildConfig();
    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });
  }
  return pool;
}

export const isDatabaseConfigured = () => dbConfigured;

export async function initDeckStorage() {
  if (!dbConfigured) {
    console.warn('[DB] DATABASE_URL не задан – включён режим памяти для хранения колод.');
    return false;
  }

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cards JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        owner_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS decks_updated_at_idx ON decks(updated_at DESC);
    `);
    return true;
  } finally {
    client.release();
  }
}

export async function query(text, params = []) {
  if (!dbConfigured) {
    throw new Error('Database connection is not configured');
  }
  const qPool = getPool();
  return qPool.query(text, params);
}

export async function withTransaction(fn) {
  if (!dbConfigured) {
    throw new Error('Database connection is not configured');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export default {
  isDatabaseConfigured,
  initDeckStorage,
  query,
  withTransaction,
};
