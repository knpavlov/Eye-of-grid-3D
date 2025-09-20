// Реакции на призыв врага рядом с существами (чистая логика)
import { CARDS } from '../cards.js';
import { computeCellBuff } from '../fieldEffects.js';
import { DIR_VECTORS, inBounds } from '../constants.js';

function getTemplate(unit) {
  if (!unit) return null;
  return CARDS[unit.tplId] || null;
}

function normalizeAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (value === true) return 1;
  return 0;
}

function isUnitAlive(unit, tpl) {
  const hp = typeof unit?.currentHP === 'number' ? unit.currentHP : null;
  if (hp != null) return hp > 0;
  if (typeof tpl?.hp === 'number') return tpl.hp > 0;
  return true;
}

function healUnit(state, r, c, amount) {
  if (!state?.board) return null;
  const cell = state.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return null;
  const tpl = getTemplate(unit);
  if (!tpl) return null;
  if (!isUnitAlive(unit, tpl)) return null;
  const cellElement = cell?.element || null;
  const buff = computeCellBuff(cellElement, tpl.element);
  const prevBonus = typeof unit.bonusHP === 'number' ? unit.bonusHP : 0;
  const bonusDelta = Math.max(0, amount);
  const newBonus = prevBonus + bonusDelta;
  if (newBonus !== prevBonus) {
    unit.bonusHP = newBonus;
  }
  const baseHp = tpl.hp || 0;
  const maxHp = baseHp + buff.hp + (unit.bonusHP || 0);
  if (typeof unit.currentHP !== 'number') {
    unit.currentHP = baseHp;
  }
  const before = typeof unit.currentHP === 'number' ? unit.currentHP : baseHp;
  const healDelta = Math.min(amount, Math.max(0, maxHp - before));
  if (healDelta > 0) {
    unit.currentHP = before + healDelta;
  }
  if (!healDelta && newBonus === prevBonus) return null;
  return {
    r,
    c,
    before,
    after: typeof unit.currentHP === 'number' ? unit.currentHP : baseHp,
    amount: healDelta,
    bonusDelta: newBonus - prevBonus,
  };
}

export function applyEnemySummonReactions(state, context = {}) {
  const events = { heals: [] };
  if (!state?.board) return events;
  const { r, c, unit } = context;
  if (typeof r !== 'number' || typeof c !== 'number') return events;
  if (!unit) return events;
  const enemyOwner = unit.owner;

  const processed = [];
  for (const [dir, vec] of Object.entries(DIR_VECTORS)) {
    const [dr, dc] = vec;
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const reactor = state.board?.[nr]?.[nc]?.unit;
    if (!reactor || reactor.owner === enemyOwner) continue;
    const tplReactor = getTemplate(reactor);
    if (!tplReactor) continue;
    if (!isUnitAlive(reactor, tplReactor)) continue;
    const amount = normalizeAmount(tplReactor.onEnemySummonAdjacentHealAllies);
    if (amount <= 0) continue;
    processed.push({ r: nr, c: nc, unit: reactor, tpl: tplReactor, amount, dir });
  }

  if (!processed.length) return events;

  for (const trigger of processed) {
    const owner = trigger.unit.owner;
    const healedList = [];
    for (let rr = 0; rr < state.board.length; rr += 1) {
      const row = state.board[rr];
      if (!Array.isArray(row)) continue;
      for (let cc = 0; cc < row.length; cc += 1) {
        if (rr === trigger.r && cc === trigger.c) continue; // "other" союзники
        const ally = row[cc]?.unit;
        if (!ally || ally.owner !== owner) continue;
        const healed = healUnit(state, rr, cc, trigger.amount);
        if (healed) healedList.push(healed);
      }
    }
    if (healedList.length) {
      events.heals.push({
        source: { r: trigger.r, c: trigger.c, tplId: trigger.tpl.id, dir: trigger.dir },
        amount: trigger.amount,
        healed: healedList,
      });
    }
  }

  return events;
}

export default { applyEnemySummonReactions };
