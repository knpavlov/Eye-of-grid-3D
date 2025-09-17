// Вспомогательные функции для особых шаблонов магической атаки
import { ABILITY_KEYS, getAbilityConfig } from '../abilityRegistry.js';

function collectAllCells() {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cells.push({ r, c });
    }
  }
  return cells;
}

function uniqueCells(cells) {
  const seen = new Set();
  const result = [];
  for (const cell of cells || []) {
    if (!cell) continue;
    const key = `${cell.r},${cell.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ r: cell.r, c: cell.c });
  }
  return result;
}

export function getMagicPatternConfig(tplOrId) {
  return getAbilityConfig(tplOrId, ABILITY_KEYS.MAGIC_PATTERN);
}

export function computeMagicPatternCells(state, tpl, context = {}) {
  const cfg = getMagicPatternConfig(tpl);
  if (!cfg) return null;
  const attacker = state?.board?.[context?.attacker?.r]?.[context?.attacker?.c]?.unit || null;
  const attackerOwner = attacker ? attacker.owner : null;
  const mode = (cfg.mode || cfg.type || '').toUpperCase();
  if (mode === 'NON_ELEMENT') {
    const excluded = (cfg.element || tpl?.element || '').toUpperCase();
    const cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = state?.board?.[r]?.[c];
        if (!cell?.unit) continue;
        if (excluded && (cell.element || '').toUpperCase() === excluded) continue;
        if (cfg.onlyEnemies !== false && attackerOwner != null) {
          if (cell.unit.owner === attackerOwner) continue;
        }
        cells.push({ r, c });
      }
    }
    return uniqueCells(cells);
  }
  if (mode === 'ALL_ENEMIES') {
    const cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = state?.board?.[r]?.[c];
        if (!cell?.unit) continue;
        if (cfg.onlyEnemies !== false && attackerOwner != null) {
          if (cell.unit.owner === attackerOwner) continue;
        }
        cells.push({ r, c });
      }
    }
    return uniqueCells(cells);
  }
  if (Array.isArray(cfg.cells)) {
    return uniqueCells(cfg.cells);
  }
  if (cfg === true) {
    return collectAllCells();
  }
  return null;
}
