// Утилиты для подготовки информации о погибших существах
// Модуль не использует визуальную часть и остаётся чисто логическим
import { CARDS } from '../cards.js';
import { DIR_VECTORS, inBounds } from '../constants.js';

function resolveFacing(unit, tpl) {
  if (!unit && !tpl) return 'N';
  return unit?.facing || tpl?.facing || tpl?.defaultFacing || 'N';
}

function resolveFrontInfo(state, r, c, facing) {
  const vec = DIR_VECTORS[facing] || DIR_VECTORS.N || [-1, 0];
  const fr = r + vec[0];
  const fc = c + vec[1];
  if (!inBounds(fr, fc)) return null;
  const frontCell = state?.board?.[fr]?.[fc] || null;
  const frontUnit = frontCell?.unit;
  if (!frontUnit) return null;
  const tplFront = CARDS[frontUnit.tplId];
  const baseHp = tplFront?.hp ?? 0;
  const alive = (frontUnit.currentHP ?? baseHp) > 0;
  return {
    r: fr,
    c: fc,
    owner: frontUnit.owner ?? null,
    uid: frontUnit.uid ?? null,
    tplId: frontUnit.tplId ?? null,
    alive,
  };
}

/**
 * Формирует запись о гибели существа с дополнительной информацией
 * о его ориентации и цели перед ним (если она есть).
 */
export function buildDeathRecord(state, r, c, unit) {
  if (!unit) return null;
  const cell = state?.board?.[r]?.[c] || null;
  const tpl = CARDS[unit.tplId];
  const facing = resolveFacing(unit, tpl);
  const front = resolveFrontInfo(state, r, c, facing);
  return {
    r,
    c,
    owner: unit.owner,
    tplId: unit.tplId,
    uid: unit.uid ?? null,
    element: cell?.element || null,
    facing,
    front,
    frontOwner: front?.owner ?? null,
  };
}

export default { buildDeathRecord };
