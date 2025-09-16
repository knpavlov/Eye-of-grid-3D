// Модуль работы с БД PostgreSQL. Максимально изолирован от остального кода сервера.
// При отсутствии pg или DATABASE_URL модуль переходит в режим in-memory (для локальной отладки).

let pgLib = null;
let pool = null;
let initialized = false;
let dbEnabled = false;

function resolveSslConfig() {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable' || mode === 'allow') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
  return false;
}

async function loadPgLibrary() {
  if (pgLib) return pgLib;
  try {
    pgLib = await import('pg');
    return pgLib;
  } catch (err) {
    console.warn('[db] Модуль "pg" не найден. Сервер переключится в in-memory режим.', err?.message);
    return null;
  }
}

export function isDbEnabled() {
  return dbEnabled && !!pool;
}

export async function initDb() {
  if (initialized) {
    return { ready: dbEnabled, reason: dbEnabled ? null : 'unavailable' };
  }
  initialized = true;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL не задан. Используем временное in-memory хранилище.');
    dbEnabled = false;
    return { ready: false, reason: 'missing-url' };
  }

  const pg = await loadPgLibrary();
  if (!pg) {
    dbEnabled = false;
    return { ready: false, reason: 'missing-driver' };
  }

  pool = new pg.Pool({
    connectionString: url,
    ssl: resolveSslConfig(),
    max: Number(process.env.PG_POOL_MAX) || 10,
  });

  pool.on('error', (err) => {
    console.error('[db] Ошибка пула PostgreSQL', err);
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        cards JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        owner_id TEXT
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS decks_updated_at_idx ON decks (updated_at DESC);
    `);
    dbEnabled = true;
    return { ready: true };
  } catch (err) {
    console.error('[db] Не удалось инициализировать таблицы PostgreSQL', err);
    dbEnabled = false;
    return { ready: false, reason: 'init-failed', error: err };
  }
}

export async function query(text, params = []) {
  if (!isDbEnabled()) {
    throw new Error('Database connection is not available');
  }
  return pool.query(text, params);
}

export async function withClient(run) {
  if (!isDbEnabled()) {
    throw new Error('Database connection is not available');
  }
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

export async function shutdownDb() {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      console.warn('[db] Ошибка при завершении пула', err);
    }
  }
}

process.on('SIGINT', () => { shutdownDb().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { shutdownDb().finally(() => process.exit(0)); });

export default {
  initDb,
  isDbEnabled,
  query,
  withClient,
  shutdownDb,
};
