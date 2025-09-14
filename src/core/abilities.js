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

// Проверяем, обладает ли существо невидимостью
export function hasInvisibility(state, r, c, unit, tpl) {
  if (!state || !unit || !tpl) return false;
  if (unit.invisible || tpl.invisibility) return true;
  if (tpl.invisibilityWithSpider) {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        const u = state.board?.[rr]?.[cc]?.unit;
        if (u && u.owner === unit.owner && /SPIDER_NINJA/.test(u.tplId)) return true;
      }
    }
  }
  return false;
}

// Передача контроля над существами на нужных полях (Possession)
export function gainPossession(state, controller, sourceUid, element) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const u = cell?.unit;
      if (!u) continue;
      if (cell.element === element && u.owner !== controller) {
        u.controller = controller;
        u.possessedBy = { controller, source: sourceUid };
        u.possessedAt = state.turn;
      }
    }
  }
}

// Сбрасываем владение, если источник контроля исчез
export function removePossessionBySource(state, sourceUid) {
  if (!state || !sourceUid) return;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const u = state.board?.[r]?.[c]?.unit;
      if (u && u.possessedBy?.source === sourceUid) {
        delete u.controller;
        delete u.possessedBy;
        delete u.possessedAt;
      }
    }
  }
}
