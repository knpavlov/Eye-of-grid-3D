// Общие функции для обработки особых свойств карт
import { CARDS } from './cards.js';

// локальная функция ограничения маны (без импорта во избежание циклов)
const capMana = (m) => Math.min(10, m);

// базовая стоимость активации без каких‑либо скидок
function baseActivationCost(tpl) {
  return tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, (tpl && tpl.cost ? tpl.cost - 1 : 0));
}

// фактическая стоимость атаки с учётом скидок (например, "активация на X меньше")
export function activationCost(tpl, fieldElement) {
  let cost = baseActivationCost(tpl);
  if (tpl && tpl.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const onElem = tpl && tpl.activationReductionOnElement;
  if (onElem && fieldElement === onElem.element) {
    cost = Math.max(0, cost - onElem.reduction);
  }
  return cost;
}

// стоимость поворота/обычной активации — без скидок
export const rotateCost = (tpl) => baseActivationCost(tpl);

// Проверка наличия способности "быстрота"
export const hasFirstStrike = (tpl) => !!(tpl && tpl.firstStrike);

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

// Проверка наличия способности "двойная атака"
export const hasDoubleAttack = (tpl) => !!(tpl && tpl.doubleAttack);

// Проверка способности "форт"
export const isFortress = (tpl) => !!(tpl && tpl.fortress);

// Обработка триггеров при смерти существ (например, лечение союзников)
export function handleDeathTriggers(state, deaths) {
  const log = [];
  for (const d of deaths || []) {
    const tpl = CARDS[d.tplId];
    if (tpl?.onDeathHealAll) {
      const heal = tpl.onDeathHealAll;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const cell = state.board?.[r]?.[c];
          const u = cell?.unit;
          if (!u || u.owner !== d.owner) continue;
          const tplU = CARDS[u.tplId];
          const max = (tplU.hp || 0) + 2;
          const before = u.currentHP ?? tplU.hp;
          u.currentHP = Math.min(max, before + heal);
        }
      }
      log.push(`${tpl.name}: союзники получают +${heal} HP.`);
    }
  }
  return log;
}

