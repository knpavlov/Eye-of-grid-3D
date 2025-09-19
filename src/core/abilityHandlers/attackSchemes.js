// Модуль выбора активной схемы атаки
import { CARDS } from '../cards.js';

function normalizeElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function normalizeElementMap(raw) {
  const map = new Map();
  if (!raw) return map;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    if (!entry) continue;
    const element = typeof entry === 'string'
      ? entry
      : entry.element;
    const scheme = typeof entry === 'string'
      ? null
      : entry.scheme || entry.key;
    if (!element || !scheme) continue;
    map.set(String(element).toUpperCase(), String(scheme));
  }
  return map;
}

function findScheme(tpl, key) {
  if (!tpl || !key) return null;
  const schemes = Array.isArray(tpl.attackSchemes) ? tpl.attackSchemes : [];
  return schemes.find(s => (s.key || s.label) === key) || null;
}

export function resolveAttackProfile(state, ctx = {}) {
  const { tpl: tplRaw, unit, r, c } = ctx;
  const tpl = tplRaw || (unit ? CARDS[unit.tplId] : null);
  if (!tpl) return null;
  const schemes = Array.isArray(tpl.attackSchemes) ? tpl.attackSchemes : [];
  if (!schemes.length) return null;

  const requested = ctx.schemeKey || ctx.requestedKey || null;
  if (requested) {
    const direct = findScheme(tpl, requested);
    if (direct) return direct;
  }

  let element = null;
  if (state?.board && typeof r === 'number' && typeof c === 'number') {
    element = normalizeElement(state.board?.[r]?.[c]?.element || null);
  }

  if (element) {
    const map = normalizeElementMap(tpl.forceSchemeOnElement || tpl.mustUseSchemeOnElement);
    const forced = map.get(element);
    if (forced) {
      const scheme = findScheme(tpl, forced);
      if (scheme) return scheme;
    }
    const mustMagic = normalizeElement(tpl.mustUseMagicOnElement);
    if (mustMagic && mustMagic === element) {
      const magicScheme = schemes.find(s => {
        if (s?.attackType) return s.attackType === 'MAGIC';
        if (s?.key) return String(s.key).toUpperCase() === 'MAGIC';
        return false;
      });
      if (magicScheme) return magicScheme;
    }
  }

  const defaultKey = tpl.defaultSchemeKey;
  if (defaultKey) {
    const scheme = findScheme(tpl, defaultKey);
    if (scheme) return scheme;
  }

  return schemes[0] || null;
}

export function getAllSchemes(tpl) {
  if (!tpl) return [];
  return Array.isArray(tpl.attackSchemes) ? tpl.attackSchemes : [];
}
