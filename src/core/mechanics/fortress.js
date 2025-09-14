// Механика "Крепость" — существа не могут инициировать атаку
// но сохраняют возможность контратаковать
export function isFortress(tpl) {
  return !!(tpl && tpl.fortress);
}

export function canInitiateAttack(tpl) {
  return !isFortress(tpl);
}

export default { isFortress, canInitiateAttack };
