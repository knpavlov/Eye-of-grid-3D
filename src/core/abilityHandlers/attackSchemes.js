// Модуль для выбора схем атаки в зависимости от условий
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeElementSet(raw) {
  const set = new Set();
  for (const value of toArray(raw)) {
    if (typeof value === 'string' && value) {
      set.add(value.toUpperCase());
    }
  }
  return set;
}

function cloneAttacks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => (item ? { ...item } : item)).filter(Boolean);
}

function normalizeScheme(rawScheme, fallback = {}) {
  if (!rawScheme) return null;
  const key = rawScheme.key || fallback.key || null;
  return {
    key,
    label: rawScheme.label || fallback.label || null,
    attackType: rawScheme.attackType || fallback.attackType || null,
    chooseDir: rawScheme.chooseDir != null ? !!rawScheme.chooseDir : (fallback.chooseDir ?? null),
    attacks: cloneAttacks(rawScheme.attacks ?? fallback.attacks ?? []),
    magicArea: rawScheme.magicArea || rawScheme.magicAttackArea || fallback.magicArea || null,
  };
}

function collectSchemes(tpl) {
  const base = {
    key: null,
    attackType: tpl?.attackType || 'STANDARD',
    chooseDir: tpl?.chooseDir ?? false,
    attacks: cloneAttacks(tpl?.attacks || []),
    magicArea: tpl?.magicAttackArea || null,
  };
  const raw = Array.isArray(tpl?.attackSchemes) ? tpl.attackSchemes : [];
  return raw.map((scheme, index) => normalizeScheme({ ...scheme, key: scheme.key || `SCHEME_${index}` }, base)).filter(Boolean);
}

function normalizeForceRules(value) {
  const rules = [];
  for (const raw of toArray(value)) {
    if (!raw) continue;
    if (typeof raw === 'string') {
      const parts = raw.split(':');
      if (parts.length >= 2) {
        const el = parts[0]?.trim();
        const scheme = parts[1]?.trim();
        if (el && scheme) {
          rules.push({ elements: normalizeElementSet(el.split(',')), scheme });
        }
      }
      continue;
    }
    if (typeof raw === 'object') {
      const scheme = raw.scheme || raw.key || raw.schemeKey;
      if (!scheme) continue;
      const elements = normalizeElementSet(raw.elements || raw.element || raw.field || raw.fields);
      if (!elements.size) continue;
      rules.push({ elements, scheme });
    }
  }
  return rules;
}

function findSchemeByKey(tpl, key) {
  if (!tpl || !key) return null;
  const list = collectSchemes(tpl);
  for (const scheme of list) {
    if (scheme.key === key) return scheme;
  }
  return null;
}

function resolveForcedScheme(tpl, cellElement, context = {}) {
  if (!tpl) return null;
  if (context.forceSchemeKey) {
    return findSchemeByKey(tpl, context.forceSchemeKey);
  }
  const rules = normalizeForceRules(tpl.forceSchemeOnElement);
  if (!rules.length || !cellElement) return null;
  const element = cellElement.toUpperCase();
  for (const rule of rules) {
    if (rule.elements.has(element)) {
      const scheme = findSchemeByKey(tpl, rule.scheme);
      if (scheme) return scheme;
    }
  }
  return null;
}

export function resolveAttackProfile(state, tpl, context = {}) {
  if (!tpl) {
    return {
      attackType: 'STANDARD',
      chooseDir: false,
      attacks: [],
      schemeKey: null,
      magicArea: null,
    };
  }

  const cellElement = context.cellElement
    || context.cell?.element
    || ((typeof context.r === 'number' && typeof context.c === 'number')
      ? state?.board?.[context.r]?.[context.c]?.element
      : null);

  const forced = resolveForcedScheme(tpl, cellElement, context);
  if (forced) {
    return {
      attackType: forced.attackType || tpl.attackType || 'STANDARD',
      chooseDir: forced.chooseDir != null ? forced.chooseDir : (tpl.chooseDir ?? false),
      attacks: forced.attacks.length ? forced.attacks : cloneAttacks(tpl.attacks || []),
      schemeKey: forced.key || null,
      magicArea: forced.magicArea || tpl.magicAttackArea || null,
    };
  }

  return {
    attackType: tpl.attackType || 'STANDARD',
    chooseDir: tpl.chooseDir ?? false,
    attacks: cloneAttacks(tpl.attacks || []),
    schemeKey: null,
    magicArea: tpl.magicAttackArea || null,
  };
}

export function getSchemeByKey(tpl, key) {
  return findSchemeByKey(tpl, key);
}
