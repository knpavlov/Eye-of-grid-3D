// Модуль для вычисления динамических бонусов к атаке
// Держим чистую игровую логику без привязки к визуальному слою
import { countUnits } from '../board.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function countAlliedElementUnits(state, owner, element, opts = {}) {
  if (!state?.board || owner == null || !element) return 0;
  const includeSelf = opts.includeSelf === true;
  const selfR = typeof opts.selfR === 'number' ? opts.selfR : null;
  const selfC = typeof opts.selfC === 'number' ? opts.selfC : null;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!includeSelf && r === selfR && c === selfC) continue;
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit || unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (normalizeElementName(tpl.element) === element) {
        total += 1;
      }
    }
  }
  return total;
}

function countBoardUnits(state, { element = null, excludeElement = null } = {}) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const el = normalizeElementName(tpl.element);
      if (excludeElement && el === excludeElement) continue;
      if (element && el !== element) continue;
      total += 1;
    }
  }
  return total;
}

function normalizeTemplateSet(raw) {
  const ids = new Set();
  const names = new Set();
  for (const entry of toArray(raw)) {
    if (!entry) continue;
    const str = String(entry).trim();
    if (!str) continue;
    const cardById = CARDS[str];
    if (cardById?.id) {
      ids.add(cardById.id);
      if (cardById.name) names.add(cardById.name.toLowerCase());
      continue;
    }
    const cardByName = Object.values(CARDS).find(card => card?.name === str);
    if (cardByName?.id) {
      ids.add(cardByName.id);
      if (cardByName.name) names.add(cardByName.name.toLowerCase());
      continue;
    }
    ids.add(str.toUpperCase());
    names.add(str.toLowerCase());
  }
  return { ids, names };
}

function parseAddAlliedElement(raw) {
  if (!raw) return null;
  const element = normalizeElementName(raw.element || raw.type || raw.elementName);
  if (!element) return null;
  const includeSelf = raw.includeSelf === true;
  const amountPer = Number.isFinite(raw.amountPer ?? raw.per ?? raw.value ?? raw.amount)
    ? Math.floor(Number(raw.amountPer ?? raw.per ?? raw.value ?? raw.amount))
    : 1;
  return { element, includeSelf, amountPer: amountPer === 0 ? 0 : amountPer };
}

function parseBoardCount(raw) {
  if (!raw) return null;
  const element = normalizeElementName(raw.element);
  const excludeElement = normalizeElementName(raw.excludeElement || raw.exclude);
  const amountPer = Number.isFinite(raw.amountPer ?? raw.per ?? raw.value ?? raw.amount)
    ? Math.floor(Number(raw.amountPer ?? raw.per ?? raw.value ?? raw.amount))
    : 1;
  return { element, excludeElement, amountPer: amountPer === 0 ? 0 : amountPer };
}

function normalizeFormulaEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const whenRaw = raw.when || raw.conditions || raw.condition || raw;
  const valueRaw = raw.value || raw.formula || raw.result || raw;

  const selfFieldElement = normalizeElementName(whenRaw.selfFieldElement || raw.selfFieldElement);
  const selfFieldNotElement = normalizeElementName(whenRaw.selfFieldNotElement || raw.selfFieldNotElement);
  const targetEnemyElement = normalizeElementName(whenRaw.targetEnemyElement || raw.targetEnemyElement);

  const addAlliedElement = parseAddAlliedElement(valueRaw.addAlliedElement || raw.addAlliedElement);
  const addBoardCount = parseBoardCount(valueRaw.addBoardCount || raw.addBoardCount);
  const baseRaw = valueRaw.base ?? raw.base;
  const base = Number.isFinite(baseRaw) ? Math.floor(Number(baseRaw)) : null;
  const log = raw.log || valueRaw.log || null;

  const hasConditions = selfFieldElement || selfFieldNotElement || targetEnemyElement;
  if (!hasConditions) {
    // Предотвращаем безусловное переопределение, чтобы не ломать существующую логику
    return null;
  }

  const hasValue = base != null || addAlliedElement || addBoardCount;
  if (!hasValue) return null;

  return {
    conditions: { selfFieldElement, selfFieldNotElement, targetEnemyElement },
    value: { base, addAlliedElement, addBoardCount },
    log,
  };
}

function normalizeFormulaList(raw) {
  const list = [];
  for (const entry of toArray(raw)) {
    const cfg = normalizeFormulaEntry(entry);
    if (cfg) list.push(cfg);
  }
  return list;
}

function computeOverrideFromFormulas(state, r, c, tpl, opts = {}) {
  const formulas = normalizeFormulaList(tpl?.dynamicAtkFormulas);
  if (!formulas.length) return null;
  const cell = state?.board?.[r]?.[c] || null;
  const unit = cell?.unit || null;
  if (!unit) return null;
  const owner = unit.owner;
  const cellElement = normalizeElementName(cell?.element);
  const hits = Array.isArray(opts?.hits) ? opts.hits : [];

  for (const formula of formulas) {
    if (!formula) continue;
    const { conditions, value } = formula;
    if (conditions.selfFieldElement && conditions.selfFieldElement !== cellElement) continue;
    if (conditions.selfFieldNotElement && conditions.selfFieldNotElement === cellElement) continue;

    if (conditions.targetEnemyElement) {
      const match = hits.some((hit) => {
        if (!hit) return false;
        const targetUnit = state?.board?.[hit.r]?.[hit.c]?.unit;
        if (!targetUnit || targetUnit.owner === owner) return false;
        const targetTpl = CARDS[targetUnit.tplId];
        if (!targetTpl) return false;
        const targetElement = normalizeElementName(targetTpl.element);
        return targetElement === conditions.targetEnemyElement;
      });
      if (!match) continue;
    }

    let override = value.base != null ? value.base : tpl?.atk ?? 0;

    if (value.addAlliedElement && owner != null) {
      const amountPer = value.addAlliedElement.amountPer ?? 1;
      if (amountPer !== 0) {
        const total = countAlliedElementUnits(state, owner, value.addAlliedElement.element, {
          includeSelf: value.addAlliedElement.includeSelf === true,
          selfR: r,
          selfC: c,
        });
        override += total * (amountPer || 0);
      }
    }

    if (value.addBoardCount) {
      const amountPer = value.addBoardCount.amountPer ?? 1;
      if (amountPer !== 0) {
        const total = countBoardUnits(state, {
          element: value.addBoardCount.element || null,
          excludeElement: value.addBoardCount.excludeElement || null,
        });
        override += total * (amountPer || 0);
      }
    }

    const finalValue = Math.max(0, Math.floor(override));
    const log = formula.log || `${tpl?.name || 'Существо'}: атака установлена на ${finalValue}.`;
    return { override: finalValue, type: 'FORMULA_OVERRIDE', log };
  }

  return null;
}

function normalizeAllyTemplateConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' || Array.isArray(raw)) {
    const matcher = normalizeTemplateSet(raw);
    if (!matcher.ids.size && !matcher.names.size) return null;
    return {
      matcher,
      amountPer: 1,
      includeSelf: false,
      minCount: 0,
      maxCount: null,
    };
  }
  if (typeof raw === 'object') {
    const matcher = normalizeTemplateSet(raw.templates ?? raw.ids ?? raw.names ?? raw.cards ?? raw.list ?? raw.match);
    if (!matcher.ids.size && !matcher.names.size) return null;
    const amountPer = Number(raw.amountPer ?? raw.per ?? raw.amount ?? raw.plus ?? 1) || 0;
    const includeSelf = raw.includeSelf === true;
    const minCount = Number(raw.min ?? raw.minCount ?? 0) || 0;
    const maxCountRaw = raw.max ?? raw.maxCount ?? raw.cap ?? null;
    const maxCount = maxCountRaw != null ? Math.max(0, Math.floor(Number(maxCountRaw))) : null;
    return {
      matcher,
      amountPer,
      includeSelf,
      minCount: Math.max(0, Math.floor(minCount)),
      maxCount,
    };
  }
  return null;
}

function matchTemplate(unit, tpl, matcher) {
  if (!unit || !tpl || !matcher) return false;
  if (matcher.ids?.has(unit.tplId)) return true;
  if (matcher.ids?.has(tpl.id)) return true;
  const name = tpl.name ? tpl.name.toLowerCase() : '';
  if (name && matcher.names?.has(name)) return true;
  return false;
}

function countAlliedTemplates(state, r, c, owner, matcher, includeSelf) {
  if (!state?.board) return 0;
  let total = 0;
  for (let rr = 0; rr < BOARD_SIZE; rr++) {
    for (let cc = 0; cc < BOARD_SIZE; cc++) {
      if (!includeSelf && rr === r && cc === c) continue;
      const unit = state.board?.[rr]?.[cc]?.unit;
      if (!unit) continue;
      if (owner != null && unit.owner !== owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (matchTemplate(unit, tpl, matcher)) {
        total += 1;
      }
    }
  }
  return total;
}

function parseElementFromToken(token) {
  if (!token) return null;
  return normalizeElementName(token);
}

function normalizeElementConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const match = raw.match(/^([A-Z]+)_CREATURES$/);
    if (match) {
      return { type: 'ELEMENT_CREATURES', element: parseElementFromToken(match[1]) };
    }
    const direct = parseElementFromToken(raw);
    if (direct) {
      return { type: 'ELEMENT_CREATURES', element: direct };
    }
    return null;
  }
  if (typeof raw === 'object') {
    if (raw.type === 'ELEMENT_CREATURES' || raw.mode === 'ELEMENT_CREATURES') {
      const element = parseElementFromToken(raw.element || raw.elementType || raw.elementName);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
    if (!raw.type && raw.element) {
      const element = parseElementFromToken(raw.element);
      if (!element) return null;
      return { type: 'ELEMENT_CREATURES', element };
    }
  }
  return null;
}

function countElementCreatures(state, element, opts = {}) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (opts.exclude && r === opts.exclude.r && c === opts.exclude.c) continue;
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const tplElement = parseElementFromToken(tpl.element);
      if (tplElement && tplElement === element) {
        count += 1;
      }
    }
  }
  return count;
}

export function computeDynamicAttackBonus(state, r, c, tpl, opts = {}) {
  if (!tpl) return null;
  const override = computeOverrideFromFormulas(state, r, c, tpl, opts);
  if (override) {
    return override;
  }
  if (tpl.dynamicAtk) {
    const cfg = tpl.dynamicAtk;
    if (cfg === 'OTHERS_ON_BOARD') {
      const total = countUnits(state);
      const others = Math.max(0, total - 1);
      if (others <= 0) return null;
      return { amount: others, type: 'OTHERS_ON_BOARD', count: others };
    }
    const elementCfg = normalizeElementConfig(cfg);
    if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
      const count = countElementCreatures(state, elementCfg.element, { exclude: { r, c } });
      if (count <= 0) return null;
      return {
        amount: count,
        type: 'ELEMENT_CREATURES',
        element: elementCfg.element,
        count,
      };
    }
  }
  const allyCfg = normalizeAllyTemplateConfig(tpl.dynamicAtkAlliedTemplates);
  if (allyCfg && allyCfg.amountPer !== 0) {
    const owner = state?.board?.[r]?.[c]?.unit?.owner;
    const includeSelf = allyCfg.includeSelf === true;
    const count = countAlliedTemplates(state, r, c, owner, allyCfg.matcher, includeSelf);
    if (count <= 0) return null;
    if (allyCfg.minCount && count < allyCfg.minCount) return null;
    const effective = allyCfg.maxCount != null ? Math.min(count, allyCfg.maxCount) : count;
    if (effective <= 0) return null;
    const amount = allyCfg.amountPer * effective;
    if (amount === 0) return null;
    return {
      amount,
      type: 'ALLY_TEMPLATE',
      count: effective,
      matcher: allyCfg.matcher,
    };
  }
  return null;
}

export default { computeDynamicAttackBonus };
