// Общие функции нормализации и проверки колод. Чистый JS без привязки к среде.

const env = (typeof process !== 'undefined' && process?.env) ? process.env : {};

export const MIN_DECK_CARDS = Number(env.MIN_DECK_CARDS || 1);
export const MAX_DECK_CARDS = Number(env.MAX_DECK_CARDS || 60);
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 600;

function toSafeString(value) {
  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toCardId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && typeof value.id === 'string') return value.id.trim();
  return null;
}

export function collectCardIds(cards) {
  if (!Array.isArray(cards)) return [];
  const ids = [];
  for (const entry of cards) {
    const id = toCardId(entry);
    if (id) ids.push(id);
  }
  return ids;
}

export function normalizeDeckInput(raw = {}) {
  const id = toSafeString(raw.id);
  const name = toSafeString(raw.name);
  const description = toSafeString(raw.description);
  const ownerId = toSafeString(raw.ownerId || raw.owner_id || raw.userId || raw.user_id);
  const cards = collectCardIds(raw.cards);
  const versionNumber = Number(raw.version);
  const version = Number.isFinite(versionNumber) ? versionNumber : null;

  return {
    id,
    name,
    description,
    ownerId: ownerId || null,
    cards,
    version,
  };
}

export function validateDeckStructure(deck, { requireId = true } = {}) {
  const errors = [];
  const sanitized = { ...deck };

  if (requireId) {
    if (!sanitized.id) {
      errors.push('ID колоды обязателен.');
    } else if (sanitized.id.length > 120) {
      errors.push('ID колоды слишком длинный.');
      sanitized.id = sanitized.id.slice(0, 120);
    }
  } else if (sanitized.id && sanitized.id.length > 120) {
    sanitized.id = sanitized.id.slice(0, 120);
  }

  if (!sanitized.name) {
    errors.push('Название колоды не может быть пустым.');
  }
  if (sanitized.name.length > MAX_NAME_LENGTH) {
    errors.push('Название колоды слишком длинное.');
    sanitized.name = sanitized.name.slice(0, MAX_NAME_LENGTH);
  }

  if (sanitized.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push('Описание колоды слишком длинное.');
    sanitized.description = sanitized.description.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  if (!Array.isArray(sanitized.cards) || sanitized.cards.length < MIN_DECK_CARDS) {
    errors.push(`В колоде должно быть не меньше ${MIN_DECK_CARDS} карт.`);
  }
  if (Array.isArray(sanitized.cards) && sanitized.cards.length > MAX_DECK_CARDS) {
    errors.push(`В колоде должно быть не больше ${MAX_DECK_CARDS} карт.`);
    sanitized.cards = sanitized.cards.slice(0, MAX_DECK_CARDS);
  }

  return {
    valid: errors.length === 0,
    errors,
    deck: sanitized,
  };
}

export function prepareDeckForSave(raw, options = {}) {
  const normalized = normalizeDeckInput(raw);
  const { valid, errors, deck } = validateDeckStructure(normalized, options);
  return { valid, errors, deck };
}
