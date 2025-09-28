import { Router } from 'express';
import { isDbReady, getDbError } from '../server/db.js';
import {
  ensureDeckTable,
  seedDecks,
  listDecksForUser,
  getDeckAccessibleByUser,
  upsertDeckForUser,
  deleteDeckForUser,
} from '../server/repositories/decksRepository.js';
import { CARDS } from '../src/core/cards.js';
import { DEFAULT_DECK_BLUEPRINTS } from '../src/core/defaultDecks.js';
import { requireAuth } from '../server/middleware/authMiddleware.js';

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

  return { id, name, description, cards };
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

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const decks = await listDecksForUser(req.user.id, { includeShared: true });
    res.json({ decks });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось получить список колод' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const deck = await getDeckAccessibleByUser(req.params.id, req.user.id);
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
    let saved;
    try {
      saved = await upsertDeckForUser(payload, req.user.id);
    } catch (err) {
      const message = err?.message || 'Не удалось сохранить колоду';
      const forbidden = message.includes('Нет прав');
      const notFound = message.includes('не найдена');
      if (forbidden) {
        err.status = 403;
      } else if (notFound) {
        err.status = 404;
      }
      throw err;
    }
    res.status(payload.id ? 200 : 201).json({ deck: saved });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось сохранить колоду' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureStoragePrepared();
    const idRaw = req.params.id;
    const id = typeof idRaw === 'string' ? idRaw.trim() : '';
    if (!id) throw deckValidationError('Идентификатор колоды обязателен');
    const deleted = await deleteDeckForUser(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Колода не найдена' });
    }
    res.json({ deleted: true });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось удалить колоду' });
  }
});

export default router;

