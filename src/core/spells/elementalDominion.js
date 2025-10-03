// Логика эффектов доминионских заклинаний с жертвоприношением существ.
// Модуль содержит только расчёты и не зависит от визуального слоя.

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

function toKey(r, c) {
  return `${r},${c}`;
}

function ensureArray(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

/**
 * Подсчитывает количество полей указанной стихии.
 * @param {object} state - текущее состояние игры.
 * @param {string} element - нормализованное имя стихии (FIRE/WATER/...).
 * @returns {number}
 */
export function countFieldsByElement(state, element) {
  const normalized = normalizeElementName(element);
  if (!normalized || !state?.board) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    const row = state.board?.[r];
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = row?.[c];
      if (!cell) continue;
      const cellElement = normalizeElementName(cell.element);
      if (cellElement === normalized) total += 1;
    }
  }
  return total;
}

/**
 * Формирует список клеток по заданным центрам с учётом ортогональных соседей.
 * @param {Array<{r:number,c:number}>} centers - список центров.
 * @returns {Array<{r:number,c:number}>}
 */
export function collectCrossCells(centers) {
  const unique = new Map();
  ensureArray(centers).forEach(pos => {
    if (!pos) return;
    const r = Number(pos.r);
    const c = Number(pos.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return;
    unique.set(toKey(r, c), { r, c });
    const neighbors = [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];
    neighbors.forEach(n => {
      if (n.r < 0 || n.r >= BOARD_SIZE || n.c < 0 || n.c >= BOARD_SIZE) return;
      unique.set(toKey(n.r, n.c), { r: n.r, c: n.c });
    });
  });
  return Array.from(unique.values());
}

function resolveCenters(state, config) {
  if (Array.isArray(config?.centers) && config.centers.length) {
    return collectCrossCells(config.centers);
  }
  const mode = config?.mode || null;
  if (mode === 'ALL_BIOLITH') {
    const positions = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const element = normalizeElementName(state?.board?.[r]?.[c]?.element);
        if (element === 'BIOLITH') positions.push({ r, c });
      }
    }
    return collectCrossCells(positions);
  }
  return [];
}

function getUnitHp(unit, tpl) {
  if (unit && Number.isFinite(unit.currentHP)) return unit.currentHP;
  if (tpl && Number.isFinite(tpl.hp)) return tpl.hp;
  return 0;
}

/**
 * Рассчитывает план нанесения урона заклинания.
 * @param {object} state - состояние игры.
 * @param {number} casterIndex - индекс игрока, разыгрывающего заклинание.
 * @param {object} config - параметры эффекта.
 * @param {Array<{r:number,c:number}>} [config.centers] - выбранные центры.
 * @param {string} config.element - стихия, по числу полей которой считается урон.
 * @param {string} [config.mode] - особый режим (например, 'ALL_BIOLITH').
 * @returns {object}
 */
export function computeElementalBurstPlan(state, casterIndex, config) {
  const element = normalizeElementName(config?.element);
  const cells = resolveCenters(state, config);
  const damage = element ? countFieldsByElement(state, element) : 0;
  const victims = [];
  const covered = [];
  const usedCenters = [];

  if (Array.isArray(config?.centers)) {
    for (const pos of config.centers) {
      if (!pos) continue;
      const r = Number(pos.r);
      const c = Number(pos.c);
      if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
      usedCenters.push({ r, c });
    }
  } else if (config?.mode === 'ALL_BIOLITH') {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const cellElement = normalizeElementName(state?.board?.[r]?.[c]?.element);
        if (cellElement === 'BIOLITH') usedCenters.push({ r, c });
      }
    }
  }

  const seen = new Set();
  for (const cellPos of cells) {
    const key = toKey(cellPos.r, cellPos.c);
    if (seen.has(key)) continue;
    seen.add(key);
    covered.push({ r: cellPos.r, c: cellPos.c });
    const cell = state?.board?.[cellPos.r]?.[cellPos.c];
    const unit = cell?.unit;
    if (!unit) continue;
    if (casterIndex != null && unit.owner === casterIndex) continue;
    const tpl = CARDS?.[unit.tplId];
    const before = getUnitHp(unit, tpl);
    const after = Math.max(0, before - damage);
    victims.push({
      r: cellPos.r,
      c: cellPos.c,
      owner: unit.owner,
      tplId: unit.tplId,
      uid: unit.uid ?? null,
      before,
      after,
    });
  }

  return {
    element,
    damage,
    victims,
    covered,
    usedCenters,
  };
}

/**
 * Применяет рассчитанный план к состоянию и возвращает итоговые изменения.
 * @param {object} state - состояние игры.
 * @param {object} plan - результат computeElementalBurstPlan.
 * @returns {{ damage: number, hits: Array, deaths: Array }}
 */
export function applyElementalBurstPlan(state, plan) {
  if (!state || !plan) {
    return { damage: 0, hits: [], deaths: [] };
  }
  const hits = [];
  const deaths = [];
  for (const victim of ensureArray(plan.victims)) {
    const r = Number(victim.r);
    const c = Number(victim.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    const cell = state.board?.[r]?.[c];
    const unit = cell?.unit;
    if (!unit) continue;
    if (victim.uid != null && unit.uid != null && victim.uid !== unit.uid) continue;
    if (victim.tplId && unit.tplId && victim.tplId !== unit.tplId) {
      // Юнит сменился — игнорируем запись
      continue;
    }
    const tpl = CARDS?.[unit.tplId];
    const before = getUnitHp(unit, tpl);
    const after = Math.max(0, Number.isFinite(victim.after) ? victim.after : before - (plan.damage || 0));
    const delta = after - before;
    unit.currentHP = after;
    hits.push({ r, c, owner: unit.owner, tplId: unit.tplId, before, after, delta });
    if (after <= 0) {
      const entry = createDeathEntry(state, unit, r, c);
      if (entry) deaths.push(entry);
    }
  }
  return { damage: plan.damage || 0, hits, deaths, covered: plan.covered || [], usedCenters: plan.usedCenters || [] };
}

// Чтобы избежать циклической зависимости, импортируем здесь после объявления функции.
import { createDeathEntry } from '../abilityHandlers/deathRecords.js';

export default {
  countFieldsByElement,
  collectCrossCells,
  computeElementalBurstPlan,
  applyElementalBurstPlan,
};
