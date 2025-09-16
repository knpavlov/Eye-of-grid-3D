// Универсальный слой хранения колод. Позволяет работать как с PostgreSQL, так и с
// временным in-memory хранилищем, если база недоступна.
import { isDatabaseConfigured, initDeckStorage, query } from './db.js';

const memoryStore = new Map();

function cloneDeck(deck) {
  if (!deck) return null;
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: Array.isArray(deck.cards) ? [...deck.cards] : [],
    version: typeof deck.version === 'number' ? deck.version : 0,
    ownerId: deck.ownerId ?? null,
    updatedAt: deck.updatedAt || null,
  };
}

function mapRow(row) {
  if (!row) return null;
  const cards = (() => {
    if (!row.cards) return [];
    if (Array.isArray(row.cards)) return [...row.cards];
    if (typeof row.cards === 'string') {
      try { return JSON.parse(row.cards); } catch { return []; }
    }
    if (typeof row.cards === 'object' && row.cards !== null) {
      // pg-json может вернуть объект; пробуем взять массив из value
      const values = row.cards.value ?? row.cards.cards ?? row.cards;
      if (Array.isArray(values)) return [...values];
    }
    return [];
  })();

  let updatedAt = null;
  if (row.updated_at instanceof Date) {
    updatedAt = row.updated_at.toISOString();
  } else if (typeof row.updated_at === 'string') {
    updatedAt = row.updated_at;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    cards,
    version: typeof row.version === 'number' ? row.version : Number(row.version) || 0,
    ownerId: row.owner_id ?? null,
    updatedAt,
  };
}

export function isMemoryStore() {
  return !isDatabaseConfigured();
}

export async function ensureStorage() {
  return initDeckStorage();
}

export async function listDecks() {
  if (isMemoryStore()) {
    return Array.from(memoryStore.values()).map(cloneDeck);
  }
  const result = await query(`
    SELECT id, name, description, cards, version, owner_id, updated_at
    FROM decks
    ORDER BY updated_at DESC, id ASC;
  `);
  return result.rows.map(mapRow);
}

export async function getDeck(id) {
  if (!id) return null;
  if (isMemoryStore()) {
    return cloneDeck(memoryStore.get(id));
  }
  const result = await query(`
    SELECT id, name, description, cards, version, owner_id, updated_at
    FROM decks
    WHERE id = $1
    LIMIT 1;
  `, [id]);
  return mapRow(result.rows[0]);
}

export async function saveDeck(deck) {
  if (!deck?.id) {
    throw new Error('Deck ID is required for save operation');
  }
  const sanitized = {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: Array.isArray(deck.cards) ? deck.cards : [],
    ownerId: deck.ownerId ?? null,
    version: typeof deck.version === 'number' ? deck.version : null,
  };

  if (isMemoryStore()) {
    const existing = memoryStore.get(sanitized.id);
    const nextVersion = (existing?.version ?? 0) + 1;
    const updated = {
      ...sanitized,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.set(updated.id, updated);
    return cloneDeck(updated);
  }

  const existing = await getDeck(sanitized.id);
  if (existing && typeof sanitized.version === 'number' && sanitized.version !== existing.version) {
    return { conflict: true, current: existing };
  }

  const nextVersion = (existing?.version ?? 0) + 1;
  const result = await query(`
    INSERT INTO decks (id, name, description, cards, version, owner_id, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          cards = EXCLUDED.cards,
          version = EXCLUDED.version,
          owner_id = COALESCE(EXCLUDED.owner_id, decks.owner_id),
          updated_at = NOW()
    RETURNING id, name, description, cards, version, owner_id, updated_at;
  `, [
    sanitized.id,
    sanitized.name,
    sanitized.description,
    JSON.stringify(sanitized.cards),
    nextVersion,
    sanitized.ownerId,
  ]);

  return mapRow(result.rows[0]);
}
