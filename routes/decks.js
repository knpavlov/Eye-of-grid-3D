import { Router } from 'express';
import { isDbReady, getDbError } from '../server/db.js';
import {
  ensureDeckTable,
  seedDecks,
  listDecksForOwner,
  getDeckById,
  getDeckByIdForOwner,
  upsertDeckRecord,
  deleteDeckRecord,
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

async function ensureStorageAndHandle(req, res, next) {
  try {
    await ensureStoragePrepared();
    return next();
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Хранилище колод недоступно' });
  }
}

router.use(requireAuth);
router.use(ensureStorageAndHandle);

router.get('/', async (req, res) => {
  try {
    const decks = await listDecksForOwner(req.user?.id, { includeShared: true });
    res.json({ decks });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось получить список колод' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const deck = await getDeckByIdForOwner(req.params.id, req.user?.id);
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
    const payload = sanitizeDeckPayload(req.body);
    let deckId = payload.id;
    if (payload.id) {
      const existing = await getDeckById(payload.id);
      if (existing) {
        if (existing.ownerId && existing.ownerId !== req.user?.id) {
          const err = new Error('Недостаточно прав для изменения этой колоды');
          err.status = 403;
          throw err;
        }
        if (!existing.ownerId) {
          // Общая колода — создаём пользовательскую копию
          deckId = undefined;
        }
      }
    }
    const saved = await upsertDeckRecord({ ...payload, id: deckId, ownerId: req.user?.id || null });
    const status = deckId ? 200 : 201;
    res.status(status).json({ deck: saved });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Не удалось сохранить колоду' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const idRaw = req.params.id;
    const id = typeof idRaw === 'string' ? idRaw.trim() : '';
    if (!id) throw deckValidationError('Идентификатор колоды обязателен');
    const deck = await getDeckById(id);
    if (!deck) {
      return res.status(404).json({ error: 'Колода не найдена' });
    }
    if (deck.ownerId && deck.ownerId !== req.user?.id) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления этой колоды' });
    }
    const deleted = await deleteDeckRecord(id);
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

