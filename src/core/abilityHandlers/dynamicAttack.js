// Модуль для вычисления динамических бонусов к атаке
// Держим чистую игровую логику без привязки к визуальному слою
import { countUnits } from '../board.js';
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

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

function normalizeTemplateIds(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const result = new Set();
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const direct = CARDS[trimmed];
      if (direct?.id) {
        result.add(direct.id);
        continue;
      }
      const byName = Object.values(CARDS).find(card => card?.name === trimmed);
      if (byName?.id) {
        result.add(byName.id);
        continue;
      }
      result.add(trimmed);
      continue;
    }
    if (typeof item === 'object' && item.id) {
      const tpl = CARDS[item.id] || item;
      if (tpl?.id) {
        result.add(tpl.id);
      }
    }
  }
  return Array.from(result);
}

function normalizePerTemplateConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string' || Array.isArray(raw)) {
    return normalizePerTemplateConfig({ templates: raw });
  }
  if (typeof raw !== 'object') return null;
  const templates = normalizeTemplateIds(
    raw.templates
    || raw.ids
    || raw.list
    || raw.include
    || raw.match
  );
  if (!templates.length) return null;
  const amountRaw = raw.amount ?? raw.perUnit ?? raw.perTemplate ?? 1;
  const amount = Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : 1;
  const includeSelf = raw.includeSelf === true;
  const maxCount = raw.maxCount != null
    ? Math.max(0, Math.trunc(Number(raw.maxCount)))
    : null;
  return {
    templates,
    amount,
    includeSelf,
    maxCount,
  };
}

function countAlliedByTemplates(state, owner, templates, opts = {}) {
  if (!state?.board || owner == null || !Array.isArray(templates) || !templates.length) return 0;
  const idSet = new Set(templates);
  const exclude = (opts.excludeSelf !== false) ? opts.position : null;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (exclude && r === exclude.r && c === exclude.c) continue;
      const cellUnit = row[c]?.unit;
      if (!cellUnit) continue;
      if (cellUnit.owner !== owner) continue;
      const tpl = CARDS[cellUnit.tplId];
      const tplId = tpl?.id || cellUnit.tplId;
      if (!idSet.has(tplId)) continue;
      const alive = (cellUnit.currentHP ?? tpl?.hp ?? 0) > 0;
      if (!alive) continue;
      count += 1;
    }
  }
  return count;
}

export function computeDynamicAttackBonus(state, r, c, tpl) {
  if (!tpl) return null;
  const parts = [];
  const cfg = tpl.dynamicAtk;
  if (cfg) {
    if (cfg === 'OTHERS_ON_BOARD') {
      const total = countUnits(state);
      const others = Math.max(0, total - 1);
      if (others > 0) {
        parts.push({ amount: others, type: 'OTHERS_ON_BOARD', count: others });
      }
    } else {
      const elementCfg = normalizeElementConfig(cfg);
      if (elementCfg?.type === 'ELEMENT_CREATURES' && elementCfg.element) {
        const count = countElementCreatures(state, elementCfg.element, { exclude: { r, c } });
        if (count > 0) {
          parts.push({
            amount: count,
            type: 'ELEMENT_CREATURES',
            element: elementCfg.element,
            count,
          });
        }
      }
    }
  }

  const perTplCfg = normalizePerTemplateConfig(
    tpl.plusAtkPerAlliedTemplates || tpl.plusAtkPerAlliesByTemplate
  );
  if (perTplCfg) {
    const owner = state?.board?.[r]?.[c]?.unit?.owner ?? null;
    if (owner != null) {
      const position = { r, c };
      const rawCount = countAlliedByTemplates(state, owner, perTplCfg.templates, {
        position,
        excludeSelf: !perTplCfg.includeSelf,
      });
      const effectiveCount = perTplCfg.maxCount != null
        ? Math.min(perTplCfg.maxCount, rawCount)
        : rawCount;
      if (effectiveCount > 0 && perTplCfg.amount !== 0) {
        const amount = effectiveCount * perTplCfg.amount;
        parts.push({
          amount,
          type: 'ALLY_TEMPLATE_COUNT',
          count: effectiveCount,
          templates: perTplCfg.templates,
          templateNames: perTplCfg.templates.map(id => CARDS[id]?.name || id),
          perTemplate: perTplCfg.amount,
        });
      }
    }
  }

  if (!parts.length) return null;
  const total = parts.reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
  const result = { amount: total, parts };
  if (parts.length === 1) {
    Object.assign(result, parts[0]);
  }
  return result;
}

export default { computeDynamicAttackBonus };
