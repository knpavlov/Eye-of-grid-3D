// Логика условных бонусов, зависящих от текущего состояния юнита (например, от количества HP)
import { CARDS } from '../cards.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function normalizeHpEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { hp: Math.floor(raw), atk: 0, dodgeAttempts: 0, dodgeChance: null, label: null };
  }
  if (typeof raw === 'object') {
    const hp = toNumber(raw.hp ?? raw.value ?? raw.eq ?? raw.equals, null);
    if (hp == null) return null;
    const atk = toNumber(raw.atk ?? raw.attack ?? raw.attackBonus ?? raw.plusAtk, 0) || 0;
    const dodgeAttempts = toNumber(raw.dodgeAttempts ?? raw.dodge ?? raw.gainDodge ?? raw.dodgeAttempt, 0) || 0;
    const dodgeChance = raw.dodgeChance != null ? toNumber(raw.dodgeChance, null) : (raw.chance != null ? toNumber(raw.chance, null) : null);
    const label = typeof raw.label === 'string' ? raw.label : null;
    return {
      hp: Math.floor(hp),
      atk,
      dodgeAttempts: Math.max(0, Math.floor(dodgeAttempts)),
      dodgeChance: (dodgeChance != null && Number.isFinite(dodgeChance)) ? dodgeChance : null,
      label,
    };
  }
  return null;
}

function collectHpEntries(tpl) {
  if (!tpl?.hpEqualsBonuses) return [];
  const entries = [];
  for (const raw of toArray(tpl.hpEqualsBonuses)) {
    const normalized = normalizeHpEntry(raw);
    if (normalized) entries.push(normalized);
  }
  return entries;
}

function getUnitCurrentHp(unit, tpl) {
  if (!unit) return tpl?.hp ?? 0;
  if (typeof unit.currentHP === 'number') return unit.currentHP;
  if (tpl?.id && CARDS[tpl.id]) {
    return CARDS[tpl.id].hp ?? 0;
  }
  return tpl?.hp ?? 0;
}

export function getHpConditionalBonuses(unit, tpl) {
  if (!tpl) return null;
  const entries = collectHpEntries(tpl);
  if (!entries.length) return null;
  const hp = getUnitCurrentHp(unit, tpl);
  const matched = entries.filter(entry => entry.hp === hp);
  if (!matched.length) return null;

  let attackBonus = 0;
  let dodgeAttempts = 0;
  let dodgeChance = null;
  const details = [];

  for (const entry of matched) {
    if (entry.atk) attackBonus += entry.atk;
    if (entry.dodgeAttempts) {
      dodgeAttempts += entry.dodgeAttempts;
      if (entry.dodgeChance != null) {
        dodgeChance = entry.dodgeChance;
      }
    }
    details.push(entry);
  }

  return {
    attackBonus,
    dodgeAttempts,
    dodgeChance,
    details,
    hp,
  };
}

export default {
  getHpConditionalBonuses,
};
