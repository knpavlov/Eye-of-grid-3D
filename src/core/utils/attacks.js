// Утилиты для работы с профилями атаки
export function cloneAttackEntry(entry = {}) {
  const copy = { ...entry };
  if (Array.isArray(entry.ranges)) copy.ranges = entry.ranges.slice();
  return copy;
}
