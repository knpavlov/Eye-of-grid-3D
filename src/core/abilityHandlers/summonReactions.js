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

function healUnit(state, r, c, amount, opts = {}) {
  if (!state?.board) return null;
  const cell = state.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return null;
  const tpl = getTemplate(unit);
  if (!tpl) return null;
  if (!isUnitAlive(unit, tpl)) return null;
  const safeAmount = Math.max(0, Math.floor(amount || 0));
  if (safeAmount <= 0) return null;
  const cellElement = cell?.element || null;
  const buff = computeCellBuff(cellElement, tpl.element);
  if (opts.increaseMax) {
    unit.bonusHP = (unit.bonusHP || 0) + safeAmount;
  }
  const maxHp = (tpl.hp || 0) + buff.hp + (unit.bonusHP || 0);
  const before = typeof unit.currentHP === 'number' ? unit.currentHP : (tpl.hp || 0);
  if (maxHp <= before) return null;
  const delta = Math.min(safeAmount, maxHp - before);
  if (delta <= 0) return null;
  unit.currentHP = before + delta;
  return { r, c, before, after: unit.currentHP, amount: delta };
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
        const healed = healUnit(state, rr, cc, trigger.amount, { increaseMax: true });
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
