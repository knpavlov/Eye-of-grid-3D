// Модуль трансформации профилей атаки на основе условий клетки
// Используем для повторного применения логики сокращения дальности и других эффектов
import { cloneAttackEntry } from '../utils/attacks.js';

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeRangeLimit(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { element: null, maxRange: Math.max(1, Math.floor(raw)) };
  }
  if (typeof raw === 'object') {
    const element = raw.element || raw.field || raw.type;
    const max = raw.maxRange || raw.max || raw.limit || raw.range || raw.value;
    if (max == null) return null;
    const min = raw.minRange || raw.min || null;
    const clampMax = Math.max(1, Math.floor(Number(max)));
    const clampMin = min != null ? Math.max(1, Math.floor(Number(min))) : null;
    return {
      element: element ? String(element).toUpperCase() : null,
      maxRange: clampMax,
      minRange: clampMin,
    };
  }
  return null;
}

function applyRangeLimit(profile, limit, cellElement) {
  if (!profile || !Array.isArray(profile.attacks) || profile.attacks.length === 0) return profile;
  if (!limit) return profile;
  if (limit.element && cellElement && limit.element !== cellElement) return profile;

  const maxRange = limit.maxRange;
  const minRange = limit.minRange != null ? Math.min(limit.minRange, maxRange) : null;

  let changed = false;
  const updated = profile.attacks.map((entry) => {
    const copy = cloneAttackEntry(entry);
    const ranges = Array.isArray(copy.ranges) ? copy.ranges.filter((r) => {
      const value = Math.max(1, Math.floor(Number(r)));
      if (value > maxRange) return false;
      if (minRange != null && value < minRange) return false;
      return true;
    }) : [];
    if (ranges.length !== (entry.ranges ? entry.ranges.length : 0)) {
      changed = true;
    }
    if (ranges.length === 0) {
      ranges.push(Math.min(maxRange, minRange != null ? minRange : maxRange));
    }
    copy.ranges = ranges;
    return copy;
  });

  if (changed) {
    profile.attacks = updated;
  }
  return profile;
}

export function transformAttackProfile(state, r, c, tpl, profile) {
  if (!tpl || !profile) return profile;
  const cellElement = state?.board?.[r]?.[c]?.element || null;
  const rulesRaw = [
    ...toArray(tpl.limitRangeOnElement),
    ...toArray(tpl.limitRangesOnElement),
  ];
  const rules = rulesRaw
    .map(normalizeRangeLimit)
    .filter((rule) => rule && Number.isFinite(rule.maxRange));

  if (!rules.length) return profile;

  for (const rule of rules) {
    applyRangeLimit(profile, rule, cellElement);
  }
  return profile;
}
