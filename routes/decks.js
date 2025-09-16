// REST API для работы с колодами. Здесь только HTTP-слой и проверка входных данных.
import { Router } from 'express';
import { getDeck, listDecks, saveDeck, isMemoryStore } from '../server/decksStore.js';
import { prepareDeckForSave } from '../shared/decks/validation.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const decks = await listDecks();
    return res.json({ decks, source: isMemoryStore() ? 'memory' : 'database' });
  } catch (err) {
    console.error('[API] Ошибка при выдаче списка колод', err);
    return res.status(500).json({ error: 'Не удалось получить список колод' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const deck = await getDeck(req.params.id);
    if (!deck) {
      return res.status(404).json({ error: 'Колода не найдена' });
    }
    return res.json({ deck, source: isMemoryStore() ? 'memory' : 'database' });
  } catch (err) {
    console.error('[API] Ошибка при получении колоды', err);
    return res.status(500).json({ error: 'Не удалось получить колоду' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = typeof req.body?.deck === 'object' ? req.body.deck : req.body;
    const { valid, errors, deck } = prepareDeckForSave(payload, { requireId: true });

    if (!valid) {
      return res.status(400).json({ error: 'Некорректные данные колоды', details: errors });
    }

    const result = await saveDeck(deck);
    if (result && result.conflict) {
      return res.status(409).json({
        error: 'Конфликт версий: обновите список колод и попробуйте снова',
        deck: result.current,
      });
    }

    return res.status(201).json({ deck: result, source: isMemoryStore() ? 'memory' : 'database' });
  } catch (err) {
    console.error('[API] Ошибка при сохранении колоды', err);
    return res.status(500).json({ error: 'Не удалось сохранить колоду' });
  }
});

export default router;
