// Логика разрешения шаблонов карт вынесена отдельно от визуализации.
// Здесь находим подходящий объект карты для юнитов, используя все доступные ссылки.
import { getIllustrationLookupKeys } from './cards.js';

// Быстрая индексация шаблонов по имени нужна, чтобы находить карты соперника,
// когда сервер прислал только название без явного tplId.
const NAME_INDEX_CACHE = new WeakMap();

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
  pushId(obj.tplId);
  pushId(obj.cardId);
  pushId(obj.id);
  if (typeof obj.get === 'function') {
    try {
      pushId(obj.get('tplId'));
      pushId(obj.get('cardId'));
      pushId(obj.get('id'));
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
  const baseId = typeof base.id === 'string' && base.id.trim() ? base.id.trim() : null;
  let instanceId = (typeof overlay.instanceId === 'string' && overlay.instanceId.trim())
    ? overlay.instanceId.trim()
    : null;
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined || value === null) continue;
    if (key === 'id' && baseId) {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (raw && raw !== baseId) {
        if (!instanceId) instanceId = raw;
        continue;
      }
    }
    merged[key] = value;
  }
  if (baseId) {
    merged.id = baseId;
  } else if (typeof overlay.id === 'string' && overlay.id.trim()) {
    merged.id = overlay.id.trim();
  }
  if (instanceId && (typeof merged.instanceId !== 'string' || !merged.instanceId.trim())) {
    merged.instanceId = instanceId;
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
          return { cardData: mergeTemplate(tpl, current), artRef: tpl };
        }
      }
      if (!fallbackArtRef && ids.length) {
        fallbackArtRef = { id: ids[0] };
      }
      if (!ids.length) {
        const tplByName = findTemplateByName(cardsDb, current.name || current.cardName || null);
        if (tplByName) {
          const merged = mergeTemplate(tplByName, current);
          return { cardData: merged, artRef: tplByName };
        }
      }
      if (looksLikeCardTemplate(current)) {
        const artTarget = normalizeArtRef(fallbackArtRef || current) || fallbackArtRef || current;
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
      if (typeof unit?.id === 'string' && unit.id.trim()) {
        const inst = unit.id.trim();
        if (typeof cardData.instanceId !== 'string' || !cardData.instanceId.trim()) {
          cardData.instanceId = inst;
        }
      }
      const artTargetBase = artRef || fallbackArtRef || (cardData.id ? { id: cardData.id } : cardData);
      const artTarget = normalizeArtRef(artTargetBase) || artTargetBase;
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
    const artTarget = normalizeArtRef(fallbackArtRef || tpl) || fallbackArtRef || tpl;
    return { cardData: merged || { ...tpl }, artRef: artTarget };
  }

  const idCandidates = [unit?.tplId, unit?.cardId, unit?.id];
  for (const rawId of idCandidates) {
    if (typeof rawId !== 'string') continue;
    const id = rawId.trim();
    if (!id) continue;
    const tpl = cardsDb[id];
    if (tpl) {
      const artTarget = normalizeArtRef(fallbackArtRef || { id }) || fallbackArtRef || { id };
      return { cardData: { ...tpl }, artRef: artTarget };
    }
    const tplByName = findTemplateByName(cardsDb, id);
    if (tplByName) {
      const artTarget = normalizeArtRef(fallbackArtRef || tplByName) || fallbackArtRef || tplByName;
      return { cardData: { ...tplByName }, artRef: artTarget };
    }
    if (!fallbackArtRef) fallbackArtRef = { id };
  }

  if (fallbackArtRef) {
    const normalized = normalizeArtRef(fallbackArtRef) || fallbackArtRef;
    const safeId = typeof normalized?.id === 'string' ? normalized.id : null;
    return { cardData: buildUnknownUnitStub(unit, safeId), artRef: normalized };
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
