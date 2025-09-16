// Сервис управления колодами. Вынесен отдельно от Express-роутов и БД.
import { isDbEnabled, query } from '../db.js';
import { validateDeckInput, generateDeckId } from '../../src/shared/decks/validation.js';

class DeckValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'DeckValidationError';
    this.errors = errors;
  }
}

function normalizeRow(row) {
  if (!row) return null;
  const cardsRaw = Array.isArray(row.cards)
    ? row.cards
    : typeof row.cards === 'string'
      ? (() => { try { return JSON.parse(row.cards); } catch { return []; } })()
      : [];

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    cards: cardsRaw.filter(Boolean).map(String),
    version: Number(row.version) || 1,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    ownerId: row.owner_id || null,
  };
}

const memoryStore = new Map();

function listMemoryDecks() {
  return Array.from(memoryStore.values())
    .map(deck => ({ ...deck, cards: [...deck.cards] }))
    .sort((a, b) => {
      const at = a.updatedAt || a.createdAt || '';
      const bt = b.updatedAt || b.createdAt || '';
      return bt.localeCompare(at);
    });
}

function upsertMemoryDeck(deck) {
  const existing = memoryStore.get(deck.id);
  const now = new Date().toISOString();
  const version = existing ? existing.version + 1 : 1;
  const entry = {
    id: deck.id,
    name: deck.name,
    description: deck.description || '',
    cards: [...deck.cards],
    version,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ownerId: deck.ownerId || null,
  };
  memoryStore.set(entry.id, entry);
  return { ...entry, cards: [...entry.cards] };
}

function ensureDeckId(deck) {
  if (deck.id && deck.id.trim()) return deck.id;
  return generateDeckId('DECK');
}

export async function listDecks() {
  if (!isDbEnabled()) {
    return listMemoryDecks();
  }
  const res = await query(`
    SELECT id, name, description, cards, version, created_at, updated_at, owner_id
    FROM decks
    ORDER BY updated_at DESC, created_at DESC
  `);
  return res.rows.map(normalizeRow);
}

export async function fetchDeck(id) {
  if (!id) return null;
  if (!isDbEnabled()) {
    const deck = memoryStore.get(id);
    return deck ? { ...deck, cards: [...deck.cards] } : null;
  }
  const res = await query(
    `SELECT id, name, description, cards, version, created_at, updated_at, owner_id FROM decks WHERE id = $1`,
    [id]
  );
  if (!res.rowCount) return null;
  return normalizeRow(res.rows[0]);
}

export async function saveDeck(payload = {}) {
  const validation = validateDeckInput(payload);
  if (!validation.ok) {
    throw new DeckValidationError('Некорректные данные колоды', validation.errors);
  }

  const deck = validation.deck;
  deck.id = ensureDeckId(deck);

  if (!isDbEnabled()) {
    return upsertMemoryDeck(deck);
  }

  const now = new Date();
  const res = await query(
    `
      INSERT INTO decks (id, name, description, cards, version, created_at, updated_at, owner_id)
      VALUES ($1, $2, $3, $4::jsonb, 1, $5, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          cards = EXCLUDED.cards,
          version = decks.version + 1,
          updated_at = EXCLUDED.updated_at,
          owner_id = EXCLUDED.owner_id
      RETURNING id, name, description, cards, version, created_at, updated_at, owner_id;
    `,
    [deck.id, deck.name, deck.description || '', JSON.stringify(deck.cards), now, deck.ownerId || null]
  );
  return normalizeRow(res.rows[0]);
}

export { DeckValidationError };

export default {
  listDecks,
  fetchDeck,
  saveDeck,
  DeckValidationError,
};
