// Общая валидация и нормализация данных колоды (без привязки к окружению)
// Модуль не использует DOM или Node-специфичные API и может переехать в Unity

const DEFAULT_MIN_CARDS = 1;
const DEFAULT_MAX_CARDS = 60;
const DEFAULT_MAX_COPIES = 3;
const DEFAULT_MAX_NAME = 120;
const DEFAULT_MAX_DESCRIPTION = 2048;

function extractCardId(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof entry === 'object') {
    const { id, cardId } = entry;
    const raw = typeof id === 'string' ? id : typeof cardId === 'string' ? cardId : null;
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function clampLength(str, max) {
  if (typeof str !== 'string') return '';
  if (str.length <= max) return str;
  return str.slice(0, max);
}

function sanitizeId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 120);
}

export function generateDeckId(prefix = 'DECK') {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${time}_${random}`;
}

export function normalizeDeckInput(raw = {}, options = {}) {
  const {
    minCards = DEFAULT_MIN_CARDS,
    maxCards = DEFAULT_MAX_CARDS,
  } = options;

  const normalizedCards = Array.isArray(raw.cards)
    ? raw.cards.map(extractCardId).filter(Boolean)
    : [];

  const limitedCards = normalizedCards.slice(0, maxCards);

  const normalized = {
    id: sanitizeId(raw.id || raw.deckId || ''),
    name: clampLength((raw.name || '').trim(), DEFAULT_MAX_NAME) || 'Untitled',
    description: clampLength((raw.description || '').trim(), DEFAULT_MAX_DESCRIPTION),
    cards: limitedCards,
    version: Number(raw.version) > 0 ? Number(raw.version) : 0,
    ownerId: sanitizeId(raw.ownerId || raw.owner_id || ''),
    createdAt: raw.createdAt || raw.created_at || null,
    updatedAt: raw.updatedAt || raw.updated_at || null,
    meta: typeof raw.meta === 'object' && raw.meta ? { ...raw.meta } : undefined,
  };

  return normalized;
}

export function validateDeckInput(raw = {}, options = {}) {
  const {
    minCards = DEFAULT_MIN_CARDS,
    maxCards = DEFAULT_MAX_CARDS,
    maxCopies = DEFAULT_MAX_COPIES,
    requireId = false,
  } = options;

  const deck = normalizeDeckInput(raw, { minCards, maxCards });
  const errors = [];

  if (requireId && !deck.id) {
    errors.push('Не задан идентификатор колоды.');
  }

  if (!deck.name || !deck.name.trim()) {
    errors.push('Введите название колоды.');
  }

  const cleanCards = deck.cards.filter(Boolean);
  if (cleanCards.length === 0) {
    errors.push('Колода не содержит карт.');
  }

  if (cleanCards.length > maxCards) {
    errors.push(`Колода превышает лимит в ${maxCards} карт.`);
  }

  const counts = new Map();
  for (const id of cleanCards) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const limited = Array.from(counts.entries()).filter(([, count]) => count > maxCopies);
  if (limited.length) {
    errors.push('Превышено количество копий некоторых карт.');
  }

  return {
    ok: errors.length === 0,
    errors,
    deck: {
      ...deck,
      cards: cleanCards,
    },
  };
}

export const DeckValidationLimits = {
  minCards: DEFAULT_MIN_CARDS,
  maxCards: DEFAULT_MAX_CARDS,
  maxCopies: DEFAULT_MAX_COPIES,
};

export default {
  validateDeckInput,
  normalizeDeckInput,
  generateDeckId,
  DeckValidationLimits,
};
