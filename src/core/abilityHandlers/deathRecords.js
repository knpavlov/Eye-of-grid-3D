// Вспомогательные функции для описания событий смерти существ
// Модуль содержит только чистую игровую логику, без привязки к визуализации
import { CARDS } from '../cards.js';
import { DIR_VECTORS, inBounds } from '../constants.js';

const FACING_ORDER = ['N', 'E', 'S', 'W'];

function normalizeFacing(value, tpl) {
  if (typeof value === 'string') {
    const token = value.trim().toUpperCase();
    if (FACING_ORDER.includes(token)) return token;
  }
  if (tpl && typeof tpl.facing === 'string') {
    const token = tpl.facing.trim().toUpperCase();
    if (FACING_ORDER.includes(token)) return token;
  }
  if (tpl && typeof tpl.defaultFacing === 'string') {
    const token = tpl.defaultFacing.trim().toUpperCase();
    if (FACING_ORDER.includes(token)) return token;
  }
  return 'N';
}

export function computeFrontOwner(state, r, c, facing) {
  if (!state?.board) return null;
  const vec = DIR_VECTORS[facing] || DIR_VECTORS.N;
  const fr = r + vec[0];
  const fc = c + vec[1];
  if (!inBounds(fr, fc)) return null;
  const cell = state.board?.[fr]?.[fc];
  const unit = cell?.unit;
  if (!unit) return null;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return null;
  const currentHp = typeof unit.currentHP === 'number' ? unit.currentHP : tpl.hp || 0;
  if (currentHp <= 0) return null;
  return unit.owner;
}

export function createDeathEntry(state, unit, r, c) {
  if (!state || !unit) return null;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return null;
  const facing = normalizeFacing(unit.facing, tpl);
  const element = state.board?.[r]?.[c]?.element || null;
  const frontOwner = computeFrontOwner(state, r, c, facing);
  return {
    r,
    c,
    owner: unit.owner,
    tplId: unit.tplId,
    uid: unit.uid ?? null,
    element,
    facing,
    frontOwner,
  };
}

export default {
  computeFrontOwner,
  createDeathEntry,
};
