import { Router } from 'express';
import { isDbReady, getDbError } from '../server/db.js';
import {
  ensureDeckTable,
  seedDecks,
  listDecks,
  getDeckById,
  upsertDeckRecord,
} from '../server/repositories/decksRepository.js';
import { CARDS } from '../src/core/cards.js';
import { DEFAULT_DECK_BLUEPRINTS } from '../src/core/defaultDecks.js';

const router = Router();

const CARD_ID_SET = new Set(Object.keys(CARDS));
let storageReady = false;

function deckValidationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function sanitizeDeckPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw deckValidationError('Тело запроса должно содержать описание колоды');
  }

  const id = typeof payload.id === 'string' && payload.id.trim().length ? payload.id.trim() : undefined;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) throw deckValidationError('Название колоды обязательно');
  if (name.length > 80) throw deckValidationError('Название колоды не должно превышать 80 символов');

  const descriptionRaw = typeof payload.description === 'string' ? payload.description : '';
  const description = descriptionRaw.length > 500 ? descriptionRaw.slice(0, 500) : descriptionRaw;

  if (!Array.isArray(payload.cards)) {
    throw deckValidationError('Список карт обязателен и должен быть массивом идентификаторов');
  }

  const cards = payload.cards
    .map(card => (typeof card === 'string' ? card.trim() : String(card || '')).toUpperCase())
    .filter(Boolean);

  if (!cards.length) throw deckValidationError('Колода должна содержать хотя бы одну карту');
  if (cards.length > 60) throw deckValidationError('Колода не может превышать 60 карт');

  const counts = Object.create(null);
  for (const cardId of cards) {
    if (!CARD_ID_SET.has(cardId)) {
      throw deckValidationError(`Неизвестная карта: ${cardId}`);
    }
    counts[cardId] = (counts[cardId] || 0) + 1;
    if (counts[cardId] > 3) {
      throw deckValidationError(`Карта ${cardId} превышает лимит в 3 копии`);
    }
  }

  const ownerId = typeof payload.ownerId === 'string' && payload.ownerId.trim().length
    ? payload.ownerId.trim().slice(0, 120)
    : null;

  return { id, name, description, cards, ownerId };
}

async function ensureStoragePrepared() {
  if (!isDbReady()) {
    const err = getDbError() || new Error('Хранилище недоступно');
    err.status = 503;
    throw err;
  }
  if (storageReady) return;
  await ensureDeckTable();
  await seedDecks(DEFAULT_DECK_BLUEPRINTS);
  storageReady = true;
}

router.get('/', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const decks = await listDecks();
    res.json({ decks });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось получить список колод' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const deck = await getDeckById(req.params.id);
    if (!deck) {
      return res.status(404).json({ error: 'Колода не найдена' });
    }
    res.json({ deck });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось получить колоду' });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const payload = sanitizeDeckPayload(req.body);
    const saved = await upsertDeckRecord(payload);
    res.status(payload.id ? 200 : 201).json({ deck: saved });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось сохранить колоду' });
  }
});

export default router;

