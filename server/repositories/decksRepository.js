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

export async function ensureDefaultDecksForUser(ownerId, blueprints = []) {
  if (!isDbReady()) return [];
  const userId = typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : null;
  if (!userId) return [];
  try {
    const existing = await query('SELECT COUNT(*) AS cnt FROM decks WHERE owner_id = $1;', [userId]);
    const count = Number(existing.rows?.[0]?.cnt || existing.rows?.[0]?.count || 0);
    if (count > 0) return [];
  } catch (err) {
    console.warn('[decksRepository] Не удалось проверить стартовые колоды пользователя', userId, err);
    return [];
  }

  const created = [];
  for (const blueprint of Array.isArray(blueprints) ? blueprints : []) {
    if (!blueprint) continue;
    const cards = Array.isArray(blueprint.cards) ? blueprint.cards : [];
    if (!cards.length) continue;
    const name = typeof blueprint.name === 'string' && blueprint.name.trim()
      ? blueprint.name.trim()
      : 'Starter Deck';
    const description = typeof blueprint.description === 'string'
      ? blueprint.description
      : '';
    try {
      const saved = await upsertDeckForUser({ name, description, cards }, userId);
      if (saved) created.push(saved);
    } catch (err) {
      console.warn('[decksRepository] Не удалось создать стартовую колоду для пользователя', userId, blueprint?.id || name, err);
    }
  }
  return created;
}

async function getDeckRow(id) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const result = await query(
    `SELECT id, name, description, cards, owner_id, version, updated_at FROM decks WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return result.rows?.[0] || null;
}

export async function getDeckById(id) {
  const row = await getDeckRow(id);
  return mapRow(row);
}

export async function listDecksForUser(ownerId, { includeShared = true } = {}) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const params = [ownerId];
  const where = includeShared
    ? '(owner_id = $1 OR owner_id IS NULL)'
    : 'owner_id = $1';
  const result = await query(
    `SELECT id, name, description, cards, owner_id, version, updated_at
     FROM decks
     WHERE ${where}
     ORDER BY (owner_id = $1) DESC, updated_at DESC, name ASC;`,
    params
  );
  return result.rows.map(mapRow);
}

export async function getDeckAccessibleByUser(id, ownerId) {
  const deck = await getDeckById(id);
  if (!deck) return null;
  if (!deck.ownerId) return deck;
  if (deck.ownerId === ownerId) return deck;
  return null;
}

export async function upsertDeckForUser(deck, ownerId) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  const userId = typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : null;
  if (!userId) throw new Error('Нельзя сохранить колоду без владельца');

  const requestedId = typeof deck.id === 'string' && deck.id.trim() ? deck.id.trim() : null;
  const name = (deck.name || '').trim();
  const description = (deck.description || '').trim();
  const cardsJson = JSON.stringify(deck.cards || []);

  if (requestedId) {
    // Если пришёл идентификатор, проверяем существование —
    // это позволяет принимать как обновление, так и создание с клиентским ID.
    const existingRow = await getDeckRow(requestedId);
    if (existingRow) {
      if ((existingRow.owner_id || null) !== userId) {
        throw new Error('Нет прав на изменение этой колоды');
      }
      const result = await query(
        `UPDATE decks
         SET name = $2,
             description = $3,
             cards = $4,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $5
         RETURNING id, name, description, cards, owner_id, version, updated_at;`,
        [requestedId, name, description, cardsJson, userId]
      );
      return mapRow(result.rows?.[0]);
    }

    const inserted = await query(
      `INSERT INTO decks (id, name, description, cards, owner_id, version)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING id, name, description, cards, owner_id, version, updated_at;`,
      [requestedId, name, description, cardsJson, userId]
    );
    return mapRow(inserted.rows?.[0]);
  }

  const generatedId = randomUUID();
  const result = await query(
    `INSERT INTO decks (id, name, description, cards, owner_id, version)
     VALUES ($1, $2, $3, $4, $5, 1)
     RETURNING id, name, description, cards, owner_id, version, updated_at;`,
    [generatedId, name, description, cardsJson, userId]
  );
  return mapRow(result.rows?.[0]);
}

export async function deleteDeckForUser(id, ownerId) {
  if (!isDbReady()) throw new Error('Хранилище колод недоступно');
  if (!id || !ownerId) return false;
  const result = await query(
    'DELETE FROM decks WHERE id = $1 AND owner_id = $2;',
    [id, ownerId]
  );
  const affected = typeof result.rowCount === 'number'
    ? result.rowCount
    : Number(result.rowCount || 0);
  return affected > 0;
}

