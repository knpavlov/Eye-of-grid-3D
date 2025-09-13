// Модуль с реализацией особых свойств карт
// Все функции стараемся держать простыми и переиспользуемыми
import { CARDS } from './cards.js';
import { countUnits } from './board.js';

// Расчёт стоимости атаки с учётом модификаторов
export function attackCost(tpl, cell) {
  let cost = tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, ((tpl && tpl.cost) || 0) - 1);
  if (tpl?.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const redOnElem = tpl?.activationReductionOnElement;
  if (redOnElem && cell?.element === redOnElem.element) {
    cost = Math.max(0, cost - redOnElem.reduction);
  }
  return cost;
}

// Бонус к атаке, зависящий от состояния
export function dynamicAtkBonus(tpl, state, unit) {
  if (!tpl?.dynamicAtk || !state) return 0;
  switch (tpl.dynamicAtk) {
    case 'OTHERS_ON_BOARD': {
      const total = countUnits(state);
      return Math.max(0, total - 1);
    }
    default:
      return 0;
  }
}

// Случайный бонус +2 к атаке
export function randomAtkBonus(tpl) {
  return tpl?.randomPlus2 && Math.random() < 0.5 ? 2 : 0;
}

// Штраф за количество целей
export function applyPenaltyByTargets(tpl, atk, targetCount) {
  const map = tpl?.penaltyByTargets;
  if (!map) return atk;
  const penalty = map[targetCount];
  if (typeof penalty === 'number') {
    return Math.max(0, atk + penalty);
  }
  return atk;
}

// Проверка на быстроту
export const hasFirstStrike = tpl => !!tpl?.firstStrike;

// Проверяем уничтожение вне своей стихии
export function checkElementDeaths(state) {
  const deaths = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const u = cell?.unit;
      if (!u) continue;
      const tpl = CARDS[u.tplId];
      if (tpl?.diesOffElement && cell.element !== tpl.diesOffElement) {
        deaths.push({ r, c, owner: u.owner, tplId: u.tplId });
        cell.unit = null;
      }
    }
  }
  return deaths;
}

// Аура: получение маны при призыве союзника
export function handleAlliedSummon(state, owner) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const u = cell?.unit;
      if (!u || u.owner !== owner) continue;
      const tpl = CARDS[u.tplId];
      if (tpl?.auraGainManaOnSummon && cell.element !== 'FIRE') {
        const pl = state.players?.[owner];
        if (pl) pl.mana = Math.min(10, (pl.mana || 0) + 1);
      }
    }
  }
}
