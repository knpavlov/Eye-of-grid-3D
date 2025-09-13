// Модуль для обработки особых свойств карт
// Позволяет переиспользовать логику способностей по ключевым словам

import { CARDS } from './cards.js';

// Расчёт стоимости активации атаки с учётом различных модификаторов
export function attackCost(tpl, cellElement) {
  let cost = tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, ((tpl && tpl.cost) || 0) - 1);
  if (tpl?.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  if (tpl?.activationReductionOnElement && cellElement === tpl.activationReductionOnElement.element) {
    cost = Math.max(0, cost - tpl.activationReductionOnElement.reduction);
  }
  return cost;
}

// Базовая атака с учётом динамических свойств
export function baseAttack(tpl, state) {
  let atk = tpl?.atk || 0;
  if (tpl?.randomPlus2 && Math.random() < 0.5) atk += 2;
  if (tpl?.dynamicAtk === 'OTHERS_ON_BOARD') {
    let total = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (state.board?.[r]?.[c]?.unit) total++;
    }
    atk += Math.max(0, total - 1);
  }
  return atk;
}

// Проверка наличия быстроты
export const hasFirstStrike = (tpl) => !!tpl?.firstStrike;
