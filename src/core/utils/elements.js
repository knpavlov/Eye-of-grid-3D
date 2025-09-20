// Вспомогательные функции для нормализации названий стихий
export function normalizeElementName(value) {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  if (upper === 'WOOD') return 'FOREST';
  return upper;
}

export function normalizeElementSet(raw) {
  const set = new Set();
  if (raw == null) return set;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    const el = normalizeElementName(item);
    if (el) set.add(el);
  }
  return set;
}

export default { normalizeElementName, normalizeElementSet };
