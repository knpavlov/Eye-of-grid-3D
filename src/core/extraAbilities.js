// Дополнительные способности и утилиты
import { CARDS } from './cards.js';

// Проверка невидимости существа
export function hasInvisibility(state, unit) {
  if (!unit) return false;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return false;
  if (tpl.invisibility) return true; // постоянная невидимость
  if (tpl.invisibilityWithSpider) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const u = state.board?.[r]?.[c]?.unit;
        if (u && u.owner === unit.owner && u.tplId === tpl.invisibilityWithSpider) return true;
      }
    }
  }
  if (tpl.invisibilityWithAlly) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const u = state.board?.[r]?.[c]?.unit;
        if (u && u.owner === unit.owner && CARDS[u.tplId].name === tpl.invisibilityWithAlly) return true;
      }
    }
  }
  return false;
}

// Применение эффекта владения (Possession)
export function applyPossession(state, target, newOwner, possessorUid) {
  if (!target || !target.unit) return;
  const u = target.unit;
  if (u.owner === newOwner) return;
  u.originalOwner = u.originalOwner ?? u.owner;
  u.owner = newOwner;
  u.possessedBy = possessorUid;
  u.lastAttackTurn = state.turn; // активируется только со следующего хода
  u.lastRotateTurn = state.turn;
}

// Снятие владения, когда контролирующее существо погибает
export function releasePossessions(state, possessorUid) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const u = state.board?.[r]?.[c]?.unit;
      if (u && u.possessedBy === possessorUid) {
        u.owner = u.originalOwner ?? u.owner;
        delete u.possessedBy;
      }
    }
  }
}

export function isFortress(tpl) {
  return !!tpl?.fortress;
}
