// Координатор работы редактора колод: синхронизация локального стора и REST API
// Модуль не зависит от DOM, что облегчает перенос в другие окружения (например, Unity)

import { fetchDecks as apiFetchDecks, saveDeck as apiSaveDeck, DeckApiError } from '../net/decks.js';
import {
  getDecks,
  getDeckById,
  replaceDecksFromSerialized,
  upsertSerializedDeck,
  serializeDeck,
} from '../core/decks.js';
import { validateDeckInput, generateDeckId } from '../shared/decks/validation.js';

export class DeckWorkflowError extends Error {
  constructor(message, { errors, cause } = {}) {
    super(message);
    this.name = 'DeckWorkflowError';
    this.errors = Array.isArray(errors) ? errors : errors ? [errors] : [];
    this.cause = cause || null;
  }
}

function mapApiError(err) {
  if (err instanceof DeckWorkflowError) return err;
  if (err instanceof DeckApiError) {
    const details = Array.isArray(err.details) ? err.details : err.details?.details || err.details?.errors;
    return new DeckWorkflowError(err.message, { errors: details, cause: err });
  }
  return new DeckWorkflowError(err?.message || 'Неизвестная ошибка', { cause: err });
}

export async function refreshDecks({ allowEmptyReplace = false, signal, silent = false } = {}) {
  try {
    const remote = await apiFetchDecks({ signal });
    if (Array.isArray(remote) && (remote.length || allowEmptyReplace)) {
      return replaceDecksFromSerialized(remote, { allowEmpty: allowEmptyReplace });
    }
  } catch (err) {
    if (!silent) {
      throw mapApiError(err);
    }
  }
  return getDecks();
}

export async function bootstrapDecks(options = {}) {
  const { failHard = false } = options;
  try {
    return await refreshDecks({ allowEmptyReplace: options.allowEmptyReplace, silent: !failHard });
  } catch (err) {
    if (failHard) throw err;
    console.warn('[deckController] Не удалось загрузить список колод при старте', err);
    return getDecks();
  }
}

export async function persistDeck(input, { allowLocalFallback = false, syncAfterSave = true, signal } = {}) {
  const { ok, errors, deck } = validateDeckInput(input);
  if (!ok) {
    throw new DeckWorkflowError('Колода не прошла проверку', { errors });
  }

  deck.id = deck.id || generateDeckId('DECK');
  deck.cards = deck.cards.filter(Boolean);

  try {
    const saved = await apiSaveDeck(deck, { signal });
    const result = upsertSerializedDeck(saved);
    if (syncAfterSave) {
      try { await refreshDecks({ allowEmptyReplace: true, silent: true }); } catch {}
    }
    return result;
  } catch (err) {
    if (allowLocalFallback) {
      const existing = getDeckById(deck.id);
      const version = existing ? (existing.version || 0) + 1 : 1;
      const fallback = {
        ...serializeDeck(existing || { id: deck.id }),
        ...deck,
        version,
        updatedAt: new Date().toISOString(),
      };
      return upsertSerializedDeck(fallback, { skipPersist: false });
    }
    throw mapApiError(err);
  }
}

export default {
  bootstrapDecks,
  refreshDecks,
  persistDeck,
};
