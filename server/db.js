// Модуль инициализации подключения к БД PostgreSQL
// Держим его максимально изолированным, чтобы при переносе на другие движки
// было легко заменить реализацию хранения
let pool = null;
let dbReady = false;
let lastError = null;

function resolvePoolCtor(pgModule) {
  if (!pgModule) return null;
  if (typeof pgModule.Pool === 'function') return pgModule.Pool;
  if (pgModule.default && typeof pgModule.default.Pool === 'function') {
    return pgModule.default.Pool;
  }
  return null;
}

function buildSslConfig(url) {
  if (!url) return undefined;
  if (process.env.PGSSLMODE === 'disable') return undefined;
  const lowered = url.toLowerCase();
  const local = lowered.includes('localhost') || lowered.includes('127.0.0.1');
  return local ? undefined : { rejectUnauthorized: false };
}

export function isDbReady() {
  return dbReady;
}

export function getDbError() {
  return lastError;
}

export async function initDb() {
  if (dbReady) return true;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    lastError = new Error('DATABASE_URL не задан, модули хранения колод отключены');
    console.warn(lastError.message);
    return false;
  }

  try {
    const pgModule = await import('pg');
    const Pool = resolvePoolCtor(pgModule);
    if (!Pool) {
      throw new Error('Не удалось получить конструктор Pool из пакета pg');
    }

    pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
    });

    pool.on?.('error', (err) => {
      console.error('[db] Ошибка соединения пула', err);
      lastError = err;
    });

    await pool.query('SELECT 1');
    dbReady = true;
    lastError = null;
    console.log('[db] Подключение к PostgreSQL установлено');
    return true;
  } catch (err) {
    console.error('[db] Не удалось инициализировать подключение', err);
    lastError = err;
    pool = null;
    dbReady = false;
    return false;
  }
}

export async function closeDb() {
  if (pool) {
    try { await pool.end(); } catch (err) { console.warn('[db] Ошибка закрытия пула', err); }
    pool = null;
    dbReady = false;
  }
}

export async function query(text, params = []) {
  if (!dbReady || !pool) {
    throw lastError || new Error('Подключение к базе данных не готово');
  }
  return pool.query(text, params);
}

