// Модуль для вычисления динамических бонусов к атаке
// Держим чистую игровую логику без привязки к визуальному слою
import { countUnits } from '../board.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function parseElementFromToken(token) {
  if (!token) return null;
  return normalizeElementName(token);
}

function normalizeElementConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const match = raw.match(/^([A-Z]+)_CREATURES$/);
    if (match) {
      return { type: 'ELEMENT_CREATURES', element: parseElementFromToken(match[1]) };
    }
    const direct = parseElementFromToken(raw);
    if (direct) {
      return { type: 'ELEMENT_CREATURES', element: direct };
    }
    return null;
  }
  if (typeof raw === 'object') {
    if (raw.type === 'ELEMENT_CREATURES' || raw.mode === 'ELEMENT_CREATURES') {
      const element = parseElementFromToken(raw.element || raw.elementType || raw.elementName);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
    if (!raw.type && raw.element) {
      const element = parseElementFromToken(raw.element);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
  }
  return null;
}

function countElementCreatures(state, element, opts = {}) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (opts.exclude && r === opts.exclude.r && c === opts.exclude.c) continue;
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const tplElement = parseElementFromToken(tpl.element);
      if (tplElement && tplElement === element) {
        count += 1;
      }
    }
  }
  return count;
}

export function computeDynamicAttackBonus(state, r, c, tpl) {
  if (!tpl || !tpl.dynamicAtk) return null;
  const cfg = tpl.dynamicAtk;
  if (cfg === 'OTHERS_ON_BOARD') {
    const total = countUnits(state);
    const others = Math.max(0, total - 1);
    if (others <= 0) return null;
    return { amount: others, type: 'OTHERS_ON_BOARD', count: others };
  }
  const elementCfg = normalizeElementConfig(cfg);
  if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
    const count = countElementCreatures(state, elementCfg.element, { exclude: { r, c } });
    if (count <= 0) return null;
    return {
      amount: count,
      type: 'ELEMENT_CREATURES',
      element: elementCfg.element,
      count,
    };
  }
  return null;
}

export default { computeDynamicAttackBonus };
