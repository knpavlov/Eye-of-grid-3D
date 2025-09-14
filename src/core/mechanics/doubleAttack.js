// Механика двойной атаки
// Возвращает массив попаданий с удвоенным уроном
export function applyDoubleAttack(hits = []) {
  return hits.map(h => ({ ...h, dmg: (h.dmg || 0) * 2 }));
}

export default { applyDoubleAttack };
