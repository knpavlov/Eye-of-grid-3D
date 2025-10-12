// Логика разрешения шаблонов карт вынесена отдельно от визуализации.
// Здесь находим подходящий объект карты для юнитов, используя все доступные ссылки.
import { getIllustrationLookupKeys } from './cards.js';

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
