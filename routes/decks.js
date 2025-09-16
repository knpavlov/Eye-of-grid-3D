import { Router } from 'express';
import { listDecks, fetchDeck, saveDeck, DeckValidationError } from '../server/services/deckService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const decks = await listDecks();
    res.json({ decks });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const deck = await fetchDeck(req.params.id);
    if (!deck) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    res.json({ deck });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const deck = await saveDeck(req.body || {});
    res.status(201).json({ deck });
  } catch (err) {
    if (err instanceof DeckValidationError) {
      res.status(400).json({ error: err.message, details: err.errors });
      return;
    }
    next(err);
  }
});

export default router;
