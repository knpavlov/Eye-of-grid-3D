// Обработка случайных усилений при призыве (чистая логика, без привязки к визуалу)
import { CARDS } from '../cards.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clampChance(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function normalizeBuff(entry) {
  if (!entry) return null;
  if (typeof entry === 'object') {
    const chance = clampChance(entry.chance ?? entry.rate ?? entry.probability ?? 0.5);
    const atk = Number(entry.atk ?? entry.attack ?? entry.plusAtk ?? entry.attackBonus ?? 0) || 0;
    const hp = Number(entry.hp ?? entry.plusHp ?? entry.health ?? 0) || 0;
    if (atk === 0 && hp === 0) return null;
    return { chance, atk, hp };
  }
  return null;
}

function getTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

export function applySummonStatBuffs(state, r, c, opts = {}) {
  const events = { logs: [], statBuffs: [] };
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return events;
  const tpl = getTemplate(unit);
  if (!tpl) return events;

  const entries = toArray(tpl.randomSummonBuff);
  if (!entries.length) return events;

  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  let changed = false;

  for (const raw of entries) {
    const buff = normalizeBuff(raw);
    if (!buff) continue;
    const roll = clampChance(rng());
    if (roll >= buff.chance) continue;
    let logParts = [];
    if (buff.hp) {
      const before = unit.currentHP ?? tpl.hp ?? 0;
      unit.bonusHP = (unit.bonusHP || 0) + buff.hp;
      unit.currentHP = before + buff.hp;
      logParts.push(`+${buff.hp} HP`);
    }
    if (buff.atk) {
      unit.permanentAtkBuff = (unit.permanentAtkBuff || 0) + buff.atk;
      logParts.push(`+${buff.atk} ATK`);
    }
    events.statBuffs.push({
      r,
      c,
      hp: buff.hp || 0,
      atk: buff.atk || 0,
      tplId: tpl.id,
    });
    if (logParts.length) {
      events.logs.push(`${tpl.name}: удачный призыв (${logParts.join(', ')}).`);
    }
    changed = true;
  }

  if (!changed) {
    return { logs: events.logs, statBuffs: events.statBuffs };
  }

  return events;
}

export default {
  applySummonStatBuffs,
};
