// Реестр ключевых способностей и доступ к конфигурации карт
import { CARDS } from './cards.js';

export const ABILITY_KEYS = Object.freeze({
  INCARNATION: 'incarnation',
  MAGIC_PATTERN: 'magicPattern',
});

function normalizeAbilityConfig(raw) {
  if (!raw) return {};
  if (raw === true) return {};
  if (typeof raw === 'string') return { type: raw };
  if (typeof raw === 'number') return { value: raw };
  if (typeof raw === 'object') return { ...raw };
  return {};
}

function legacyAbilityConfig(tpl, key) {
  if (!tpl) return null;
  if (key === ABILITY_KEYS.INCARNATION) {
    if (tpl.incarnation) return normalizeAbilityConfig(tpl.incarnation);
    return null;
  }
  if (key === ABILITY_KEYS.MAGIC_PATTERN) {
    if (tpl.magicPattern) return normalizeAbilityConfig(tpl.magicPattern);
    if (tpl.targetAllNonElement) {
      return { mode: 'NON_ELEMENT', element: tpl.targetAllNonElement };
    }
    if (tpl.targetAllEnemies) {
      return { mode: 'ALL_ENEMIES' };
    }
    return null;
  }
  return null;
}

export function getAbilityConfig(tplOrId, key) {
  if (!key) return null;
  let tpl = tplOrId;
  if (tpl && typeof tpl === 'string') {
    tpl = CARDS[tpl] || null;
  }
  if (!tpl) return null;
  const abilities = tpl.abilities || {};
  if (abilities[key] != null) {
    return normalizeAbilityConfig(abilities[key]);
  }
  return legacyAbilityConfig(tpl, key);
}

export function hasAbility(tplOrId, key) {
  return !!getAbilityConfig(tplOrId, key);
}

export function listAbilityKeys(tplOrId) {
  const result = [];
  for (const key of Object.values(ABILITY_KEYS)) {
    if (hasAbility(tplOrId, key)) result.push(key);
  }
  return result;
}
