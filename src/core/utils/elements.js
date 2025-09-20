// Утилиты для работы со стихиями, независимые от визуальной части
// Нужны для единообразного сравнения элементов и поддержки синонимов
const ELEMENT_ALIASES = {
  FIRE: 'FIRE',
  WATER: 'WATER',
  EARTH: 'EARTH',
  FOREST: 'FOREST',
  WOOD: 'FOREST',
  BIOLITH: 'BIOLITH',
};

export function normalizeElement(value) {
  if (value == null) return null;
  const key = String(value).trim().toUpperCase();
  if (!key) return null;
  return ELEMENT_ALIASES[key] || key;
}

export function elementsEqual(a, b) {
  const na = normalizeElement(a);
  const nb = normalizeElement(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function normalizeElementList(values) {
  const result = new Set();
  if (!values) return result;
  const list = Array.isArray(values) ? values : [values];
  for (const raw of list) {
    const el = normalizeElement(raw);
    if (el) result.add(el);
  }
  return result;
}
