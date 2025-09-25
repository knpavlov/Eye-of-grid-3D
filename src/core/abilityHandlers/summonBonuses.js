// Обработка бонусов, которые срабатывают при призыве самого существа
// Содержит только игровую логику без визуальных побочных эффектов
import { CARDS } from '../cards.js';

function clampChance(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function normalizeRandomSelfBuff(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const chance = clampChance(raw.chance ?? raw.rate ?? raw.probability ?? 0.5);
    const hp = Number.isFinite(raw.hp) ? Math.floor(raw.hp) : Number.isFinite(raw.health) ? Math.floor(raw.health) : 0;
    const atk = Number.isFinite(raw.atk) ? Math.floor(raw.atk) : Number.isFinite(raw.attack) ? Math.floor(raw.attack) : Number.isFinite(raw.atkBonus) ? Math.floor(raw.atkBonus) : 0;
    if (!hp && !atk) return null;
    return { chance, hp, atk };
  }
  return null;
}

function applyHpBonus(unit, tpl, amount) {
  if (!unit || !tpl || !amount) return null;
  const safeAmount = Math.max(0, Math.floor(amount));
  if (!safeAmount) return null;
  const baseHp = typeof tpl.hp === 'number' ? tpl.hp : 0;
  const prevBonus = Math.max(0, Math.floor(unit.bonusHP || 0));
  const prevMax = baseHp + prevBonus;
  const before = Number.isFinite(unit.currentHP) ? unit.currentHP : baseHp;
  unit.bonusHP = prevBonus + safeAmount;
  const newMax = prevMax + safeAmount;
  const after = Math.min(newMax, before + safeAmount);
  unit.currentHP = after;
  return { before, after, amount: safeAmount };
}

function applyAtkBonus(unit, amount) {
  if (!unit || !amount) return null;
  const safeAmount = Math.max(0, Math.floor(amount));
  if (!safeAmount) return null;
  const prev = Math.max(0, Math.floor(unit.bonusAtk || 0));
  unit.bonusAtk = prev + safeAmount;
  return { before: prev, after: unit.bonusAtk, amount: safeAmount };
}

export function applySummonSelfBuffs(state, r, c, opts = {}) {
  const result = { logs: [] };
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return result;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return result;

  const config = normalizeRandomSelfBuff(tpl.randomSelfBuffOnSummon || tpl.randomBuffOnSummon);
  if (!config) return result;

  const rng = typeof opts?.rng === 'function' ? opts.rng : Math.random;
  const roll = rng();
  result.roll = roll;
  if (roll >= config.chance) {
    return result;
  }

  const hpChange = applyHpBonus(unit, tpl, config.hp);
  const atkChange = applyAtkBonus(unit, config.atk);

  if (hpChange) {
    result.hp = hpChange.amount;
    result.logs.push(`${tpl.name}: получает +${hpChange.amount} HP (текущее значение ${hpChange.after}).`);
  }
  if (atkChange) {
    result.atk = atkChange.amount;
    result.logs.push(`${tpl.name}: получает +${atkChange.amount} ATK.`);
  }
  result.applied = true;
  return result;
}

export default { applySummonSelfBuffs };
