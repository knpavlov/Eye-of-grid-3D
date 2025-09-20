// Обработка эффектов исцеления, зависящих от действий врага
// Логика вынесена отдельно от визуала для удобства тестирования
import { CARDS } from '../cards.js';
import { computeCellBuff } from '../fieldEffects.js';

const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function inBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function normalizeHealAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function healAllies(state, owner, amount, excludeKey) {
  const healed = [];
  if (amount <= 0) return healed;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (excludeKey && excludeKey === `${r},${c}`) continue;
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit || unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const buff = computeCellBuff(cell?.element || null, tpl.element);
      const baseHp = tpl.hp || 0;
      const bonus = typeof unit.bonusHP === 'number' ? unit.bonusHP : 0;
      const maxHp = baseHp + buff.hp + bonus;
      const before = typeof unit.currentHP === 'number' ? unit.currentHP : baseHp;
      if (before >= maxHp) continue;
      const after = Math.min(maxHp, before + amount);
      unit.currentHP = after;
      healed.push({ r, c, before, after, delta: after - before });
    }
  }
  return healed;
}

export function applyEnemySummonAdjacentHeal(state, summonR, summonC) {
  const result = { heals: [] };
  if (!state?.board) return result;
  const summoned = state.board?.[summonR]?.[summonC]?.unit;
  if (!summoned) return result;

  for (const dir of DIRS) {
    const r = summonR + dir.dr;
    const c = summonC + dir.dc;
    if (!inBounds(r, c)) continue;
    const fortress = state.board?.[r]?.[c]?.unit;
    if (!fortress) continue;
    if (fortress.owner === summoned.owner) continue;
    const tpl = CARDS[fortress.tplId];
    if (!tpl || !tpl.onEnemySummonAdjacentHealAllies) continue;
    const amount = normalizeHealAmount(tpl.onEnemySummonAdjacentHealAllies);
    if (amount <= 0) continue;
    const exclude = `${r},${c}`;
    const healedUnits = healAllies(state, fortress.owner, amount, exclude);
    if (!healedUnits.length) continue;
    result.heals.push({
      source: { r, c, tplId: tpl.id },
      amount,
      units: healedUnits,
    });
  }

  return result;
}
