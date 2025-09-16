import { randomUUID } from 'crypto';
import { isDbReady, query } from '../db.js';

function mapRow(row) {
  if (!row) return null;
  let cards = [];
  if (Array.isArray(row.cards)) {
    cards = row.cards;
  } else if (row.cards) {
    try {
      cards = typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards;
    } catch {
      cards = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    cards,
    ownerId: row.owner_id || null,
    version: typeof row.version === 'number' ? row.version : Number(row.version) || 1,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function ensureDeckTable() {
  if (!isDbReady()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cards JSONB NOT NULL,
      owner_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_decks_updated_at ON decks(updated_at DESC);
  `);
  return true;
}

export async function seedDecks(blueprints = []) {
  if (!isDbReady() || !blueprints.length) return 0;
  const result = await query('SELECT COUNT(*) AS cnt FROM decks;');
  const count = Number(result.rows?.[0]?.cnt || result.rows?.[0]?.count || 0);
  if (count > 0) return 0;
  let inserted = 0;
  for (const deck of blueprints) {
    try {
      const id = deck.id || randomUUID();
      await query(
        `INSERT INTO decks (id, name, description, cards, owner_id, version)
         VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (id) DO NOTHING;`,
        [id, deck.name || id, deck.description || '', JSON.stringify(deck.cards || []), deck.ownerId || null]
      );
      inserted += 1;
    } catch (err) {
      console.warn('[decksRepository] Не удалось вставить стартовую колоду', deck?.id, err);
    }
  }
  return inserted;
}

export async function listDecks() {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const result = await query(`
    SELECT id, name, description, cards, owner_id, version, updated_at
    FROM decks
    ORDER BY updated_at DESC, name ASC;
  `);
  return result.rows.map(mapRow);
}

export async function getDeckById(id) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const result = await query(
    `SELECT id, name, description, cards, owner_id, version, updated_at FROM decks WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return mapRow(result.rows?.[0]);
}

export async function upsertDeckRecord(deck) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const id = deck.id || randomUUID();
  const result = await query(
    `INSERT INTO decks (id, name, description, cards, owner_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       cards = EXCLUDED.cards,
       owner_id = EXCLUDED.owner_id,
       version = decks.version + 1,
       updated_at = NOW()
     RETURNING id, name, description, cards, owner_id, version, updated_at;`,
    [id, deck.name, deck.description || '', JSON.stringify(deck.cards || []), deck.ownerId || null]
  );
  return mapRow(result.rows?.[0]);
}

