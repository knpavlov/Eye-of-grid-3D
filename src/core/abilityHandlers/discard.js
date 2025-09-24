// Логика принудительного сброса карт при срабатывании способностей
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function countFieldsOfElement(state, element) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (!cell) continue;
      const el = normalizeElementName(cell.element);
      if (el === element) total += 1;
    }
  }
  return total;
}

function shouldTrigger(condition, ctx) {
  if (!condition) return true;
  if (typeof condition === 'string') {
    const raw = condition.toUpperCase();
    if (raw.startsWith('NON_')) {
      const el = normalizeElementName(raw.slice(4));
      return el ? ctx.fieldElement !== el : true;
    }
    const el = normalizeElementName(condition);
    return el ? ctx.fieldElement === el : true;
  }
  const element = normalizeElementName(condition.element ?? condition.field ?? condition.value ?? condition.equals);
  const notElement = normalizeElementName(condition.notElement ?? condition.notEquals);
  const type = String(condition.type || condition.mode || '').toUpperCase();
  if (notElement) {
    return ctx.fieldElement !== notElement;
  }
  if (type === 'NON_ELEMENT' || type === 'NON_FIELD' || type === 'NOT_EQUALS' || type === 'NOT') {
    return element ? ctx.fieldElement !== element : true;
  }
  if (type === 'ON_ELEMENT' || type === 'FIELD' || type === 'EQUALS' || type === 'MATCH') {
    return element ? ctx.fieldElement === element : true;
  }
  if (condition.equals != null) {
    const el = normalizeElementName(condition.equals);
    return el ? ctx.fieldElement === el : true;
  }
  if (condition.notEquals != null) {
    const el = normalizeElementName(condition.notEquals);
    return el ? ctx.fieldElement !== el : true;
  }
  return element ? ctx.fieldElement === element : true;
}

function resolveCount(cfg, ctx) {
  if (cfg == null) return 0;
  if (typeof cfg === 'number') {
    return Math.max(0, Math.floor(cfg));
  }
  if (typeof cfg === 'string') {
    const num = Number.parseInt(cfg, 10);
    if (Number.isFinite(num)) return Math.max(0, Math.floor(num));
  }
  if (typeof cfg !== 'object') return 0;
  const type = String(cfg.type || cfg.kind || '').toUpperCase();
  if (type === 'FIELDS' || type === 'FIELDS_OF_ELEMENT' || type === 'ELEMENT_FIELDS') {
    const el = normalizeElementName(cfg.element);
    return countFieldsOfElement(ctx.stateAfter ?? ctx.stateBefore, el);
  }
  if (type === 'ALLY_DEATHS') {
    return Math.max(0, Math.floor(ctx.alliedDeaths ?? 0));
  }
  if (type === 'FIXED' || type === 'STATIC') {
    const amount = cfg.amount ?? cfg.value ?? cfg.count;
    return Math.max(0, Math.floor(amount ?? 0));
  }
  const amount = cfg.amount ?? cfg.value ?? cfg.count;
  if (typeof amount === 'number') {
    return Math.max(0, Math.floor(amount));
  }
  return 0;
}

function normalizeAuraConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { amount: Math.max(0, Math.floor(raw)), element: null };
  }
  if (typeof raw === 'object') {
    const amount = raw.amount ?? raw.value ?? raw.count ?? 1;
    const element = normalizeElementName(raw.element ?? raw.field ?? raw.onElement);
    return { amount: Math.max(0, Math.floor(amount)), element };
  }
  return null;
}

function formatLabelFromSources(sources) {
  if (!Array.isArray(sources) || !sources.length) return 'Существо';
  const unique = new Map();
  for (const src of sources) {
    const name = src?.name || src?.tplId || 'Существо';
    unique.set(name, (unique.get(name) || 0) + 1);
  }
  const parts = [];
  for (const [name, count] of unique.entries()) {
    if (count > 1) parts.push(`${name} (x${count})`);
    else parts.push(name);
  }
  return parts.join(', ');
}

export function collectForcedDiscardEffects({ stateBefore, stateAfter, deaths } = {}) {
  const events = [];
  const logs = [];
  const deathsList = Array.isArray(deaths) ? deaths.filter(Boolean) : [];
  if (!deathsList.length) {
    return { events, logs };
  }
  const boardBefore = stateBefore?.board || stateAfter?.board || [];
  const boardAfter = stateAfter?.board || stateBefore?.board || [];
  const players = stateAfter?.players || stateBefore?.players || [];
  const playersCount = Array.isArray(players) && players.length ? players.length : 2;

  for (const death of deathsList) {
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const configs = toArray(tpl.onDeathDiscard);
    if (!configs.length) continue;
    const cellBefore = boardBefore?.[death.r]?.[death.c] || null;
    const fieldElement = normalizeElementName(cellBefore?.element);
    for (const cfg of configs) {
      if (!cfg) continue;
      const triggered = shouldTrigger(cfg.condition || cfg.when, {
        fieldElement,
        stateBefore,
        stateAfter,
        death,
        template: tpl,
      });
      if (!triggered) continue;
      const amountRaw = resolveCount(cfg.count ?? cfg.amount ?? cfg.cards, {
        stateBefore,
        stateAfter,
        fieldElement,
        death,
        template: tpl,
      });
      const amount = Math.max(0, Math.floor(amountRaw));
      if (amount <= 0) continue;
      const owner = typeof death.owner === 'number' ? death.owner : null;
      if (owner == null) continue;
      const opponent = playersCount === 2 ? (owner === 0 ? 1 : 0) : ((owner + 1) % playersCount);
      const label = tpl.name || tpl.id || 'Существо';
      events.push({
        targetPlayer: opponent,
        amount,
        sources: [
          {
            tplId: tpl.id,
            owner,
            position: { r: death.r, c: death.c },
            name: tpl.name,
          },
        ],
        label,
        reason: 'ON_DEATH',
        origin: {
          type: 'DEATH',
          fieldElement,
          condition: cfg.condition || cfg.when || null,
        },
      });
      logs.push(`${label}: оппонент должен сбросить ${amount} карт(ы).`);
    }
  }

  const auraMap = new Map();
  for (let r = 0; r < boardAfter.length; r += 1) {
    const row = boardAfter[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl?.discardOnAllyDeathWhileOnElement) continue;
      const cfg = normalizeAuraConfig(tpl.discardOnAllyDeathWhileOnElement);
      if (!cfg || cfg.amount <= 0) continue;
      const requiredElement = cfg.element;
      const cellElement = normalizeElementName(cell?.element);
      if (requiredElement && cellElement !== requiredElement) continue;
      const owner = typeof unit.owner === 'number' ? unit.owner : null;
      if (owner == null) continue;
      if (!auraMap.has(owner)) auraMap.set(owner, []);
      auraMap.get(owner).push({
        unit,
        tpl,
        amount: cfg.amount,
        position: { r, c },
        element: requiredElement,
      });
    }
  }

  const deathsByOwner = new Map();
  for (const death of deathsList) {
    const owner = typeof death.owner === 'number' ? death.owner : null;
    if (owner == null) continue;
    deathsByOwner.set(owner, (deathsByOwner.get(owner) || 0) + 1);
  }

  for (const [owner, sources] of auraMap.entries()) {
    const deathsCount = deathsByOwner.get(owner) || 0;
    if (deathsCount <= 0) continue;
    const totalAmount = sources.reduce((acc, src) => acc + src.amount, 0) * deathsCount;
    const safeAmount = Math.max(0, Math.floor(totalAmount));
    if (safeAmount <= 0) continue;
    const opponent = playersCount === 2 ? (owner === 0 ? 1 : 0) : ((owner + 1) % playersCount);
    const formattedSources = sources.map(src => ({
      tplId: src.tpl.id,
      owner,
      position: src.position,
      name: src.tpl.name,
    }));
    const label = formatLabelFromSources(formattedSources);
    events.push({
      targetPlayer: opponent,
      amount: safeAmount,
      sources: formattedSources,
      label,
      reason: 'ALLY_DEATH_AURA',
      origin: {
        type: 'ALLY_DEATH',
        owner,
      },
    });
    logs.push(`${label}: оппонент должен сбросить ${safeAmount} карт(ы).`);
  }

  return { events, logs };
}

export default { collectForcedDiscardEffects };
