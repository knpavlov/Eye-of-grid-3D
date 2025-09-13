// Общие функции для обработки особых свойств карт
import { CARDS } from './cards.js';

// локальная функция ограничения маны (без импорта во избежание циклов)
const capMana = (m) => Math.min(10, m);

// базовая стоимость активации (поворота) без учёта скидок
export function activationCost(tpl) {
  return tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, (tpl && tpl.cost ? tpl.cost - 1 : 0));
}

// стоимость атаки с учётом всех скидок
export function attackCost(tpl, fieldElement) {
  let cost = activationCost(tpl);
  if (tpl && tpl.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const onElem = tpl && tpl.activationReductionOnElement;
  if (onElem && fieldElement === onElem.element) {
    cost = Math.max(0, cost - onElem.reduction);
  }
  return cost;
}

// Проверка наличия способности «быстрота»
export const hasQuickness = (tpl) => !!(tpl && tpl.quickness);

// Проверка способности «идеальное уклонение» (Perfect Dodge)
export function hasPerfectDodge(tpl, cellElement) {
  if (!tpl) return false;
  if (tpl.perfectDodge) return true;
  if (tpl.perfectDodgeOnFire && cellElement === 'FIRE') return true;
  return false;
}

// Реализация ауры Фридонийского Странника при призыве союзников
// Возвращает количество полученных единиц маны
export function applyFreedonianAura(state, owner) {
  let gained = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (tpl?.auraGainManaOnSummon && unit.owner === owner && cell.element !== 'FIRE') {
        const pl = state.players[owner];
        pl.mana = capMana((pl.mana || 0) + 1);
        gained += 1;
      }
    }
  }
  return gained;
}
