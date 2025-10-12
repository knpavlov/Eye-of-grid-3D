// Логика разрешения шаблонов карт вынесена отдельно от визуализации.
// Здесь находим подходящий объект карты для юнитов, используя все доступные ссылки.
import { getIllustrationLookupKeys } from './cards.js';

// Быстрая индексация шаблонов по имени и по номеру нужна, чтобы находить карты
// соперника, даже если сервер прислал только текстовое название или порядковый
// номер карты вместо tplId.
const NAME_INDEX_CACHE = new WeakMap();
const NUMBER_INDEX_CACHE = new WeakMap();

function normalizeNameKey(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
}

function buildNameIndex(cardsDb) {
  if (!cardsDb || typeof cardsDb !== 'object') return null;
  let index = NAME_INDEX_CACHE.get(cardsDb);
  if (index) return index;
  index = new Map();
  for (const value of Object.values(cardsDb)) {
    if (!value || typeof value !== 'object') continue;
    const key = normalizeNameKey(value.name);
    if (!key || index.has(key)) continue;
    index.set(key, value);
  }
  NAME_INDEX_CACHE.set(cardsDb, index);
  return index;
}

function findTemplateByName(cardsDb, name) {
  const index = buildNameIndex(cardsDb);
  if (!index) return null;
  const key = normalizeNameKey(name);
  if (!key) return null;
  return index.get(key) || null;
}

function normalizeCardNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const intVal = Math.round(raw);
    return intVal > 0 ? intVal : null;
  }
  if (typeof raw === 'string') {
    const match = raw.match(/(\d{1,3})/);
    if (!match) return null;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return null;
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function buildNumberIndex(cardsDb) {
  if (!cardsDb || typeof cardsDb !== 'object') return null;
  let index = NUMBER_INDEX_CACHE.get(cardsDb);
  if (index) return index;
  index = new Map();
  for (const value of Object.values(cardsDb)) {
    if (!value || typeof value !== 'object') continue;
    const num = normalizeCardNumber(value.cardNumber);
    if (num == null || index.has(num)) continue;
    index.set(num, value);
  }
  NUMBER_INDEX_CACHE.set(cardsDb, index);
  return index;
}

function findTemplateByNumber(cardsDb, number) {
  const index = buildNumberIndex(cardsDb);
  if (!index) return null;
  const normalized = normalizeCardNumber(number);
  if (normalized == null) return null;
  return index.get(normalized) || null;
}

function getCardsDatabaseOverride(opts) {
  if (opts && opts.cardsDb && typeof opts.cardsDb === 'object') {
    return opts.cardsDb;
  }
  if (typeof window !== 'undefined' && window.CARDS && typeof window.CARDS === 'object') {
    return window.CARDS;
  }
  return {};
}

function collectIdCandidates(obj) {
  const ids = [];
  if (!obj || typeof obj !== 'object') return ids;
  const pushId = (raw) => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!ids.includes(trimmed)) ids.push(trimmed);
  };
  pushId(obj.id);
  pushId(obj.cardId);
  pushId(obj.tplId);
  if (typeof obj.get === 'function') {
    try {
      const maybeId = obj.get('id') || obj.get('cardId') || obj.get('tplId');
      pushId(maybeId);
    } catch {}
  }
  return ids;
}

function looksLikeCardTemplate(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const hasName = typeof obj.name === 'string' && obj.name.trim().length > 0;
  const hasType = typeof obj.type === 'string' && obj.type.trim().length > 0;
  const hasStats = typeof obj.hp === 'number' || typeof obj.atk === 'number' || typeof obj.cost === 'number';
  return hasName && hasType && hasStats;
}

function mergeTemplate(base, overlay) {
  if (!base) return overlay ? { ...overlay } : null;
  if (!overlay || typeof overlay !== 'object') return { ...base };
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined || value === null) continue;
    merged[key] = value;
  }
  return merged;
}

function buildUnknownUnitStub(unit, fallbackId = null) {
  const idCandidate = fallbackId
    || (typeof unit?.tplId === 'string' ? unit.tplId : null)
    || (typeof unit?.cardId === 'string' ? unit.cardId : null)
    || (typeof unit?.id === 'string' ? unit.id : null);
  const safeId = idCandidate || 'UNKNOWN_UNIT';
  const defaultName = typeof unit?.name === 'string' && unit.name.trim()
    ? unit.name.trim()
    : safeId;
  return {
    id: safeId,
    name: defaultName,
    type: 'UNIT',
    element: typeof unit?.element === 'string' ? unit.element : 'NEUTRAL',
    cost: Number.isFinite(unit?.cost) ? unit.cost : 0,
    activation: Number.isFinite(unit?.activation) ? unit.activation : 0,
    atk: Number.isFinite(unit?.atk) ? unit.atk : 0,
    hp: Number.isFinite(unit?.hp) ? unit.hp : (Number.isFinite(unit?.currentHP) ? unit.currentHP : 0),
    desc: typeof unit?.desc === 'string' && unit.desc.trim()
      ? unit.desc.trim()
      : 'Данные карты временно недоступны.',
  };
}

function enqueueNested(queue, obj) {
  if (!obj || typeof obj !== 'object') return;
  const nestedKeys = [
    'tpl', 'template', 'card', 'data', 'ref', 'definition', 'base', 'baseCard',
    'original', 'originalCard', 'source', 'sourceCard', 'info'
  ];
  for (const key of nestedKeys) {
    if (obj[key]) queue.push(obj[key]);
  }
}

export function resolveCardReference(ref, opts = {}) {
  const cardsDb = getCardsDatabaseOverride(opts);
  const queue = [];
  const visited = new Set();
  const push = (value) => {
    if (!value) return;
    queue.push(value);
  };
  push(ref);

  let fallbackArtRef = null;

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (typeof current === 'string') {
      const id = current.trim();
      if (!id) continue;
      if (!fallbackArtRef) fallbackArtRef = { id };
      const tpl = cardsDb[id];
      if (tpl) {
        return { cardData: { ...tpl }, artRef: tpl };
      }
      const tplByName = findTemplateByName(cardsDb, id);
      if (tplByName) {
        return { cardData: { ...tplByName }, artRef: tplByName };
      }
      continue;
    }

    if (typeof current === 'object') {
      const ids = collectIdCandidates(current);
      for (const id of ids) {
        if (!fallbackArtRef) fallbackArtRef = { id };
        const tpl = cardsDb[id];
        if (tpl) {
          return { cardData: mergeTemplate(tpl, current), artRef: mergeTemplate(tpl, current) };
        }
      }
      if (!fallbackArtRef && ids.length) {
        fallbackArtRef = { id: ids[0] };
      }
      const numberCandidate = normalizeCardNumber(current.cardNumber);
      if (numberCandidate != null) {
        const tplByNumber = findTemplateByNumber(cardsDb, numberCandidate);
        if (tplByNumber) {
          const merged = mergeTemplate(tplByNumber, current);
          return { cardData: merged, artRef: tplByNumber };
        }
      }
      if (!ids.length) {
        const tplByName = findTemplateByName(cardsDb, current.name || current.cardName || null);
        if (tplByName) {
          const merged = mergeTemplate(tplByName, current);
          return { cardData: merged, artRef: tplByName };
        }
      }
      if (looksLikeCardTemplate(current)) {
        const artTarget = fallbackArtRef || current;
        return { cardData: { ...current }, artRef: artTarget };
      }
      enqueueNested(queue, current);
      continue;
    }
  }

  return { cardData: null, artRef: fallbackArtRef };
}

export function resolveUnitCardInfo(unit, opts = {}) {
  const cardsDb = getCardsDatabaseOverride(opts);
  const candidates = [];
  const pushCandidate = (value) => {
    if (!value) return;
    candidates.push(value);
  };
  if (unit && typeof unit === 'object') {
    pushCandidate(unit);
    pushCandidate(unit.tplId);
    pushCandidate(unit.cardId);
    pushCandidate(unit.id);
    pushCandidate(unit.tpl);
    pushCandidate(unit.template);
    pushCandidate(unit.card);
    pushCandidate(unit.data);
    pushCandidate(unit.definition);
    pushCandidate(unit.base);
    pushCandidate(unit.baseCard);
    pushCandidate(unit.original);
    pushCandidate(unit.originalCard);
    pushCandidate(unit.source);
    pushCandidate(unit.sourceCard);
    if (Array.isArray(unit.refs)) {
      for (const ref of unit.refs) pushCandidate(ref);
    }
  }
  if (Array.isArray(opts.additionalRefs)) {
    for (const extra of opts.additionalRefs) pushCandidate(extra);
  }

  let fallbackArtRef = null;
  for (const ref of candidates) {
    const { cardData, artRef } = resolveCardReference(ref, { cardsDb });
    if (artRef && !fallbackArtRef) fallbackArtRef = artRef;
    if (cardData) {
      const artTarget = artRef || fallbackArtRef || (cardData.id ? { id: cardData.id } : cardData);
      return { cardData, artRef: artTarget };
    }
  }

  const nameCandidates = [];
  if (typeof unit?.name === 'string') nameCandidates.push(unit.name);
  if (typeof unit?.card?.name === 'string') nameCandidates.push(unit.card.name);
  if (typeof unit?.template?.name === 'string') nameCandidates.push(unit.template.name);
  for (const name of nameCandidates) {
    const tpl = findTemplateByName(cardsDb, name);
    if (!tpl) continue;
    const merged = mergeTemplate(tpl, unit?.card || unit?.template || {});
    const artTarget = fallbackArtRef || tpl;
    return { cardData: merged || { ...tpl }, artRef: artTarget };
  }

  const numberCandidates = [];
  if (unit && typeof unit === 'object') {
    numberCandidates.push(unit.cardNumber, unit.number, unit.no);
    if (unit.card && typeof unit.card === 'object') {
      numberCandidates.push(unit.card.cardNumber, unit.card.number, unit.card.no);
    }
    if (unit.template && typeof unit.template === 'object') {
      numberCandidates.push(unit.template.cardNumber, unit.template.number, unit.template.no);
    }
  }
  if (Array.isArray(opts.additionalRefs)) {
    for (const extra of opts.additionalRefs) {
      if (extra && typeof extra === 'object') {
        numberCandidates.push(extra.cardNumber, extra.number, extra.no);
      }
    }
  }
  for (const rawNum of numberCandidates) {
    const num = normalizeCardNumber(rawNum);
    if (num == null) continue;
    const tpl = findTemplateByNumber(cardsDb, num);
    if (!tpl) continue;
    const merged = mergeTemplate(tpl, unit?.card || unit?.template || {});
    const artTarget = fallbackArtRef || tpl;
    return { cardData: merged || { ...tpl }, artRef: artTarget };
  }

  const idCandidates = [unit?.tplId, unit?.cardId, unit?.id];
  for (const rawId of idCandidates) {
    if (typeof rawId !== 'string') continue;
    const id = rawId.trim();
    if (!id) continue;
    const tpl = cardsDb[id];
    if (tpl) {
      const artTarget = fallbackArtRef || { id };
      return { cardData: { ...tpl }, artRef: artTarget };
    }
    const tplByName = findTemplateByName(cardsDb, id);
    if (tplByName) {
      const artTarget = fallbackArtRef || tplByName;
      return { cardData: { ...tplByName }, artRef: artTarget };
    }
    if (!fallbackArtRef) fallbackArtRef = { id };
  }

  if (fallbackArtRef) {
    return { cardData: buildUnknownUnitStub(unit, fallbackArtRef.id), artRef: fallbackArtRef };
  }

  if (unit && typeof unit === 'object') {
    const keys = getIllustrationLookupKeys(unit);
    if (keys.length) {
      const artTarget = { id: keys[0] };
      return { cardData: buildUnknownUnitStub(unit, artTarget.id), artRef: artTarget };
    }
  }

  return { cardData: buildUnknownUnitStub(unit || null, null), artRef: null };
}

export function normalizeArtRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') {
    const id = ref.trim();
    return id ? { id } : null;
  }
  if (typeof ref === 'object') {
    const ids = collectIdCandidates(ref);
    if (ids.length) return { id: ids[0] };
  }
  return null;
}
