// Логика блокировки призыва (Summoning Lock)
// Подсчёт существ на поле и переход в состояние unlocked

// Подсчёт всех существ на поле
export function countUnits(state){
  let count = 0;
  if (!state || !state.board) return 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board?.[r]?.[c]?.unit) count++;
    }
  }
  return count;
}

// Проверка на снятие блокировки. Возвращает true, если состояние изменилось.
export function maybeUnlock(state){
  if (!state || state.unlocked) return false;
  if (countUnits(state) >= 4){
    state.unlocked = true;
    return true;
  }
  return false;
}
