// Логика взаимодействия существ с полями (без зависимостей от визуализации)
import { OPPOSITE_ELEMENT } from './constants.js';

export function computeCellBuff(cellElement, unitElement) {
  if (!cellElement || !unitElement) return { atk: 0, hp: 0 };
  const el = cellElement.toUpperCase();
  const unitEl = unitElement.toUpperCase();
  if (el === unitEl) return { atk: 0, hp: 2 };
  if (el === 'MECH') return { atk: 0, hp: 0 };
  const opposite = OPPOSITE_ELEMENT[unitEl];
  if (opposite && el === opposite) return { atk: 0, hp: -2 };
  return { atk: 0, hp: 0 };
}

export function computeFieldHpDelta(tpl, fromElement, toElement) {
  if (!tpl) return 0;
  const prev = computeCellBuff(fromElement, tpl.element);
  const next = computeCellBuff(toElement, tpl.element);
  const prevHp = typeof prev?.hp === 'number' ? prev.hp : 0;
  const nextHp = typeof next?.hp === 'number' ? next.hp : 0;
  return nextHp - prevHp;
}

export function applyFieldChangeToUnit(unit, tpl, fromElement, toElement) {
  if (!unit || !tpl) return { delta: 0, before: unit?.currentHP ?? tpl?.hp ?? 0, after: unit?.currentHP ?? tpl?.hp ?? 0 };
  const delta = computeFieldHpDelta(tpl, fromElement, toElement);
  const before = typeof unit.currentHP === 'number' ? unit.currentHP : (tpl.hp ?? 0);
  if (delta === 0) {
    return { delta: 0, before, after: before };
  }
  const after = Math.max(0, before + delta);
  unit.currentHP = after;
  return { delta, before, after };
}

export default {
  computeCellBuff,
  computeFieldHpDelta,
  applyFieldChangeToUnit,
};
