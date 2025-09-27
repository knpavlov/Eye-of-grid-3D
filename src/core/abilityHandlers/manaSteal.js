// Логика способности "mana steal" (кража маны)
import { CARDS } from '../cards.js';

const capMana = (value) => {
  const num = Math.floor(Number(value) || 0);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 10) return 10;
  return num;
};

function ensureQueue(state) {
  if (!state) return null;
  if (!Array.isArray(state.manaStealEvents)) {
    state.manaStealEvents = [];
  }
  return state.manaStealEvents;
}

function nextEventId(state) {
  if (!state) return Date.now();
  const current = Number(state.__manaStealSeq) || 0;
  const next = current + 1;
  state.__manaStealSeq = next;
  return next;
}

function registerEvent(state, baseEvent) {
  const queue = ensureQueue(state);
  const event = {
    ...baseEvent,
    id: nextEventId(state),
    ts: Date.now(),
  };
  if (queue) {
    queue.push(event);
    if (queue.length > 20) {
      queue.splice(0, queue.length - 20);
    }
  }
  return event;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeTrigger(raw) {
  if (!raw) return null;
  const code = String(raw).toUpperCase();
  if (code === 'SUMMON' || code === 'ON_SUMMON') return 'SUMMON';
  if (code === 'DEATH' || code === 'ON_DEATH' || code === 'DESTROYED') return 'DEATH';
  return null;
}

function normalizeAmountSpec(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    const value = Math.max(0, Math.floor(raw));
    if (!Number.isFinite(value) || value <= 0) return null;
    return { kind: 'FIXED', value };
  }
  if (typeof raw === 'object') {
    if (typeof raw.value === 'number') {
      const value = Math.max(0, Math.floor(raw.value));
      if (!Number.isFinite(value) || value <= 0) return null;
      return { kind: 'FIXED', value };
    }
    const type = String(raw.type || raw.mode || '').toUpperCase();
    if (type === 'FIELD_COUNT' || type === 'FIELDS') {
      const element = String(raw.element || raw.field || '').toUpperCase();
      if (!element) return null;
      return { kind: 'FIELD_COUNT', element };
    }
    if (raw.countFieldsOfElement) {
      const element = String(raw.countFieldsOfElement || '').toUpperCase();
      if (!element) return null;
      return { kind: 'FIELD_COUNT', element };
    }
    if (raw.amountByFieldCount) {
      const element = String(raw.amountByFieldCount || '').toUpperCase();
      if (!element) return null;
      return { kind: 'FIELD_COUNT', element };
    }
  }
  return null;
}

function countFields(state, element) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    for (let c = 0; c < state.board[r].length; c += 1) {
      if (state.board?.[r]?.[c]?.element === element) total += 1;
    }
  }
  return total;
}

function resolveAmount(state, spec, ctx) {
  if (!spec) return 0;
  if (spec.kind === 'FIXED') {
    return Math.max(0, Math.floor(spec.value || 0));
  }
  if (spec.kind === 'FIELD_COUNT') {
    return countFields(state, spec.element);
  }
  return 0;
}

function normalizeEntry(raw, trigger) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { trigger, amountSpec: { kind: 'FIXED', value: amount } };
  }
  if (typeof raw !== 'object') return null;
  const entry = { trigger };
  const cloned = { ...raw };
  if (typeof cloned.amount === 'number') {
    entry.amountSpec = normalizeAmountSpec(cloned.amount);
  } else {
    entry.amountSpec = normalizeAmountSpec(cloned.amount)
      || normalizeAmountSpec(cloned.amountSpec)
      || normalizeAmountSpec(cloned.countFieldsOfElement)
      || normalizeAmountSpec(cloned.amountByFieldCount);
  }
  if (!entry.amountSpec && typeof cloned.countFieldsOfElement === 'string') {
    entry.amountSpec = { kind: 'FIELD_COUNT', element: String(cloned.countFieldsOfElement).toUpperCase() };
  }
  if (!entry.amountSpec && typeof cloned.amountByFieldCount === 'string') {
    entry.amountSpec = { kind: 'FIELD_COUNT', element: String(cloned.amountByFieldCount).toUpperCase() };
  }
  if (!entry.amountSpec && typeof cloned.amount === 'object') {
    entry.amountSpec = normalizeAmountSpec(cloned.amount);
  }
  if (!entry.amountSpec) {
    entry.amountSpec = normalizeAmountSpec(cloned.value);
  }
  if (cloned.max != null) entry.max = Math.max(0, Math.floor(cloned.max));
  if (cloned.min != null) entry.min = Math.max(0, Math.floor(cloned.min));

  const requireField = cloned.requireFieldElement || cloned.requireElement || cloned.requireField;
  if (requireField) {
    entry.requireFieldElement = String(requireField).toUpperCase();
  }
  const forbidField = cloned.forbidFieldElement || cloned.forbidElement || cloned.forbidField || cloned.excludeFieldElement;
  if (forbidField) {
    entry.forbidFieldElement = String(forbidField).toUpperCase();
  }

  const fromRaw = cloned.from ?? cloned.stealFrom ?? cloned.target ?? cloned.fromPlayer;
  const toRaw = cloned.to ?? cloned.recipient ?? cloned.giveTo ?? cloned.toPlayer;

  const mapRole = (value, fallback) => {
    if (value == null) return fallback;
    if (typeof value === 'number') return value;
    const txt = String(value).toUpperCase();
    if (txt === 'SELF' || txt === 'ALLY' || txt === 'OWNER') return 'OWNER';
    if (txt === 'OPPONENT' || txt === 'ENEMY') return 'OPPONENT';
    if (txt === 'TARGET' || txt === 'TARGET_OWNER' || txt === 'VICTIM' || txt === 'FRONT' || txt === 'FRONT_OWNER') {
      return 'TARGET';
    }
    return fallback;
  };

  entry.from = mapRole(fromRaw, 'OPPONENT');
  entry.to = mapRole(toRaw, 'OWNER');
  if (cloned.reason) entry.reason = String(cloned.reason);
  if (cloned.log === false) entry.skipLog = true;

  return entry.amountSpec ? entry : null;
}

function gatherEntries(tpl, trigger) {
  if (!tpl?.manaSteal) return [];
  const data = tpl.manaSteal;
  const list = [];
  const pickKeys = [];
  if (trigger === 'SUMMON') pickKeys.push('onSummon', 'summon');
  if (trigger === 'DEATH') pickKeys.push('onDeath', 'death', 'onDestroy', 'destroyed');
  for (const key of pickKeys) {
    const raw = data[key];
    for (const item of toArray(raw)) {
      const entry = normalizeEntry(item, trigger);
      if (entry) list.push(entry);
    }
  }
  return list;
}

function resolveRoleIndex(owner, role, ctx = {}) {
  if (typeof role === 'number') return role;
  if (role === 'OWNER') return owner;
  if (role === 'OPPONENT') return owner === 0 ? 1 : 0;
  if (role === 'TARGET') {
    if (ctx.targetOwner != null) return ctx.targetOwner;
    return null;
  }
  return owner;
}

function applyEntry(state, entry, ctx) {
  if (!state || !entry) return null;
  const owner = (ctx.owner != null) ? ctx.owner : (ctx.unit?.owner ?? null);
  if (owner == null) return null;
  const cellElement = ctx.element || ctx.cellElement || ctx.cell?.element || null;
  if (entry.requireFieldElement && cellElement !== entry.requireFieldElement) {
    return null;
  }
  if (entry.forbidFieldElement && cellElement === entry.forbidFieldElement) {
    return null;
  }

  const amountRaw = resolveAmount(state, entry.amountSpec, ctx);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) return null;

  let amount = Math.max(0, Math.floor(amountRaw));
  if (entry.max != null) amount = Math.min(amount, entry.max);
  if (entry.min != null) amount = Math.max(amount, entry.min);
  if (amount <= 0) return null;

  const fromIndex = resolveRoleIndex(owner, entry.from, ctx);
  const toIndex = resolveRoleIndex(owner, entry.to, ctx);
  if (fromIndex == null || toIndex == null || fromIndex === toIndex) return null;

  const fromPlayer = state.players?.[fromIndex];
  const toPlayer = state.players?.[toIndex];
  if (!fromPlayer || !toPlayer) return null;

  const fromBefore = capMana(fromPlayer.mana);
  const toBefore = capMana(toPlayer.mana);
  if (fromBefore <= 0) return null;

  const capacity = Math.max(0, 10 - toBefore);
  if (capacity <= 0) return null;

  const transfer = Math.min(amount, fromBefore, capacity);
  if (transfer <= 0) return null;

  const fromAfter = capMana(fromBefore - transfer);
  const toAfter = capMana(toBefore + transfer);

  fromPlayer.mana = fromAfter;
  toPlayer.mana = toAfter;

  const sourceTpl = ctx.tpl || (ctx.tplId ? CARDS[ctx.tplId] : null) || (ctx.unit ? CARDS[ctx.unit.tplId] : null);
  const sourceInfo = ctx.source || {
    tplId: sourceTpl?.id || ctx.tplId || null,
    name: sourceTpl?.name || ctx.sourceName || 'Unit',
    owner,
  };

  const baseEvent = {
    trigger: entry.trigger,
    amount: transfer,
    from: fromIndex,
    to: toIndex,
    before: { fromMana: fromBefore, toMana: toBefore },
    after: { fromMana: fromAfter, toMana: toAfter },
    source: sourceInfo,
    reason: entry.reason || ctx.reason || entry.trigger,
    element: cellElement || null,
    position: ctx.position ? { ...ctx.position } : null,
  };

  const event = registerEvent(state, baseEvent);
  if (!entry.skipLog) {
    const name = event.source?.name || 'Существо';
    const victim = (event.from != null) ? event.from + 1 : '?';
    event.log = `${name}: крадет ${transfer} маны у игрока ${victim}.`;
  }
  return event;
}

export function applySummonManaSteal(state, context = {}) {
  const { tpl, unit, cell, r, c } = context;
  const entries = gatherEntries(tpl, 'SUMMON');
  if (!entries.length) return [];
  const events = [];
  for (const entry of entries) {
    const ev = applyEntry(state, entry, {
      owner: unit?.owner,
      unit,
      tpl,
      cell,
      cellElement: cell?.element || null,
      element: cell?.element || null,
      position: (typeof r === 'number' && typeof c === 'number') ? { r, c } : null,
      reason: 'SUMMON',
    });
    if (ev) events.push(ev);
  }
  return events;
}

export function applyDeathManaSteal(state, deaths = [], context = {}) {
  if (!Array.isArray(deaths) || deaths.length === 0) return [];
  const events = [];
  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const entries = gatherEntries(tpl, 'DEATH');
    if (!entries.length) continue;
    for (const entry of entries) {
      const ev = applyEntry(state, entry, {
        owner: death.owner,
        tpl,
        tplId: tpl.id,
        element: death.element || null,
        cellElement: death.element || null,
        position: (typeof death.r === 'number' && typeof death.c === 'number') ? { r: death.r, c: death.c } : null,
        reason: context?.cause || 'DEATH',
        targetOwner: death.frontOwner != null ? death.frontOwner : null,
      });
      if (ev) events.push(ev);
    }
  }
  return events;
}

export function hasManaStealKeyword(tpl) {
  if (!tpl?.manaSteal) return false;
  const onSummon = gatherEntries(tpl, 'SUMMON');
  if (onSummon.length) return true;
  const onDeath = gatherEntries(tpl, 'DEATH');
  return onDeath.length > 0;
}

export function listManaStealEvents(state) {
  if (!state || !Array.isArray(state.manaStealEvents)) return [];
  return state.manaStealEvents.slice();
}

export default {
  applySummonManaSteal,
  applyDeathManaSteal,
  hasManaStealKeyword,
  listManaStealEvents,
};
