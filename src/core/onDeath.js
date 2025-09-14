// Обработка универсальных эффектов при гибели существ
import { CARDS } from './cards.js';

// Применяет эффекты всех погибших существ к состоянию
export function applyOnDeathEffects(state, deaths = []) {
  for (const d of deaths) {
    const tpl = CARDS[d.tplId];
    if (!tpl) continue;
    if (tpl.onDeathHealAll) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const u = state.board?.[r]?.[c]?.unit;
          if (!u || u.owner !== d.owner) continue;
          const tplU = CARDS[u.tplId];
          const before = u.currentHP ?? tplU.hp;
          u.currentHP = Math.min(tplU.hp, before + tpl.onDeathHealAll);
        }
      }
    }
  }
}

export default { applyOnDeathEffects };
