// Совместимостьный модуль, переиспользующий обобщённые расчёты аур для стоимости активации
// Файл сохранён для старого API, но вся логика сведена к вычислению общих модификаторов
import { computeAuraStatAdjustments } from './auraModifiers.js';

export function extraActivationCostFromAuras(state, r, c, opts = {}) {
  const res = computeAuraStatAdjustments(state, r, c, opts);
  return res.activation || 0;
}
