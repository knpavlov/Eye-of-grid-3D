// Эффекты от смены поля: вычисление баффов и пересчёт здоровья
// Модуль не зависит от DOM или визуализации и может использоваться из чистой логики
// и из тестов. Логика вынесена отдельно для облегчения повторного использования
// при будущей миграции движка.

// Таблица противоположных стихий. Дублируем локально, чтобы избежать циклических
// зависимостей между core-модулями.
const OPPOSITES = {
  FIRE: 'WATER',
  WATER: 'FIRE',
  EARTH: 'FOREST',
  FOREST: 'EARTH',
};

export function computeCellBuff(cellElement, unitElement) {
  if (!cellElement || !unitElement) return { atk: 0, hp: 0 };
  if (cellElement === unitElement) return { atk: 0, hp: 2 };
  if (cellElement === 'BIOLITH') return { atk: 0, hp: 0 };
  const opposite = OPPOSITES[unitElement];
  if (opposite && cellElement === opposite) return { atk: 0, hp: -2 };
  return { atk: 0, hp: 0 };
}

export function applyFieldTransitionToUnit(unit, tpl, prevElement, nextElement) {
  if (!unit || !tpl) return null;
  const fromEl = prevElement || null;
  const toEl = nextElement || null;
  if (fromEl === toEl) return null;
  const prevBuff = computeCellBuff(fromEl, tpl.element);
  const nextBuff = computeCellBuff(toEl, tpl.element);
  const deltaHp = (nextBuff.hp || 0) - (prevBuff.hp || 0);
  if (!deltaHp) return null;
  const before = typeof unit.currentHP === 'number' ? unit.currentHP : (tpl.hp || 0);
  const after = Math.max(0, before + deltaHp);
  unit.currentHP = after;
  return {
    deltaHp,
    beforeHp: before,
    afterHp: after,
    prevElement: fromEl,
    nextElement: toEl,
  };
}
