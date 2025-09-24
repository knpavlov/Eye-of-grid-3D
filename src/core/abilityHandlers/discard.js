// Обработчик эффектов принудительного сброса карт
// Модуль содержит только игровую логику без привязки к UI

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

function countFieldsByElement(state, element, opts = {}) {
  if (!state?.board || !element) return 0;
  const includeCenter = opts.includeCenter !== false;
  const includeSelf = opts.includeSelf !== false;
  const selfPos = opts.selfPos || null;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (!includeCenter && r === 1 && c === 1) continue;
      if (!includeSelf && selfPos && r === selfPos.r && c === selfPos.c) continue;
      const cellElement = normalizeElementName(row[c]?.element);
      if (cellElement === element) count += 1;
    }
  }
  return count;
}

function normalizeFieldCondition(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const el = normalizeElementName(raw);
    return el ? { element: el, mode: 'EQUAL' } : null;
  }
  if (typeof raw === 'object') {
    const el = normalizeElementName(raw.element || raw.field || raw.type);
    if (!el) return null;
    const modeRaw = String(raw.mode || raw.match || raw.compare || '').toUpperCase();
    const not = raw.not === true || raw.notEqual === true || raw.notEquals === true;
    const mode = modeRaw === 'NOT_EQUAL' || modeRaw === 'NOT' || modeRaw === 'UNEQUAL' || not
      ? 'NOT_EQUAL'
      : 'EQUAL';
    return { element: el, mode };
  }
  return null;
}

function matchesFieldCondition(fieldElement, condition) {
  if (!condition) return true;
  const normField = normalizeElementName(fieldElement);
  if (condition.mode === 'NOT_EQUAL') {
    return normField !== condition.element;
  }
  return normField === condition.element;
}

function normalizeCountConfig(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return { type: 'FIXED', amount: Math.max(0, Math.floor(raw)) };
  }
  if (typeof raw === 'string') {
    const el = normalizeElementName(raw);
    if (el) return { type: 'FIELD_ELEMENT', element: el };
  }
  if (typeof raw === 'object') {
    if (raw.type === 'FIELD_ELEMENT' || raw.countBy === 'FIELD_ELEMENT') {
      const element = normalizeElementName(raw.element || raw.field || raw.elementType);
      if (!element) return null;
      const includeCenter = raw.includeCenter !== false;
      const includeSelf = raw.includeSelf !== false;
      const limit = raw.limit != null ? Math.max(0, Math.floor(raw.limit)) : null;
      const min = raw.min != null ? Math.max(0, Math.floor(raw.min)) : 0;
      return { type: 'FIELD_ELEMENT', element, includeCenter, includeSelf, limit, min };
    }
    if (raw.type === 'FIXED') {
      const amount = Math.max(0, Math.floor(raw.amount ?? raw.value ?? 0));
      return { type: 'FIXED', amount };
    }
  }
  return null;
}

function resolveCountValue(state, cfg, context = {}) {
  if (!cfg) return 0;
  if (cfg.type === 'FIXED') {
    return Math.max(0, Math.floor(cfg.amount || 0));
  }
  if (cfg.type === 'FIELD_ELEMENT') {
    const opts = {
      includeCenter: cfg.includeCenter,
      includeSelf: cfg.includeSelf,
      selfPos: context.selfPos || null,
    };
    let amount = countFieldsByElement(state, cfg.element, opts);
    if (cfg.limit != null) amount = Math.min(cfg.limit, amount);
    if (cfg.min != null) amount = Math.max(cfg.min, amount);
    return amount;
  }
  return 0;
}

function generateDiscardId(state) {
  if (!state) return `FD_${Math.random().toString(36).slice(2, 8)}`;
  const next = ((state.__forcedDiscardSeq || 0) + 1);
  state.__forcedDiscardSeq = next;
  return `FD_${next}`;
}

function createDiscardEvent(state, base = {}) {
  const target = typeof base.target === 'number' ? base.target : null;
  const amount = Math.max(0, Math.floor(base.amount || 0));
  if (target == null || amount <= 0) return null;
  const event = {
    id: generateDiscardId(state),
    target,
    amount,
    remaining: amount,
    timeoutMs: base.timeoutMs ?? 20000,
    fallback: base.fallback || 'RANDOM',
    source: base.source || null,
    reason: base.reason || null,
    prompt: base.prompt || null,
  };
  return event;
}

function normalizeAllyWatcher(tpl, rawCfg) {
  if (!tpl || !rawCfg) return null;
  const cfg = typeof rawCfg === 'object' ? rawCfg : { count: rawCfg };
  const element = normalizeElementName(cfg.element || cfg.field || cfg.elementType);
  const countCfg = normalizeCountConfig(cfg.count ?? cfg.amount ?? 1);
  if (!countCfg) return null;
  const includeSelf = cfg.includeSelf !== false;
  const target = cfg.target === 'SELF' ? 'SELF' : 'OPPONENT';
  return {
    element,
    countCfg,
    includeSelf,
    target,
  };
}

function collectActiveWatchers(boardBefore) {
  const watchers = [];
  if (!Array.isArray(boardBefore)) return watchers;
  for (let r = 0; r < boardBefore.length; r += 1) {
    const row = boardBefore[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (!cell?.unit) continue;
      const unit = cell.unit;
      const tpl = CARDS[unit.tplId];
      if (!tpl?.forcedDiscardOnAllyDeath) continue;
      const cfg = normalizeAllyWatcher(tpl, tpl.forcedDiscardOnAllyDeath);
      if (!cfg) continue;
      const fieldEl = normalizeElementName(cell.element);
      if (cfg.element && fieldEl !== cfg.element) continue;
      const alive = (unit.currentHP ?? CARDS[unit.tplId]?.hp ?? 0) > 0;
      if (!alive) continue;
      watchers.push({
        owner: unit.owner,
        tplId: unit.tplId,
        r,
        c,
        cfg,
      });
    }
  }
  return watchers;
}

function makeSourceFromDeath(death) {
  if (!death) return null;
  const tpl = CARDS[death.tplId] || null;
  return {
    tplId: death.tplId,
    name: tpl?.name || 'Существо',
    owner: death.owner,
    r: death.r,
    c: death.c,
  };
}

function makeSourceFromWatcher(watcher) {
  if (!watcher) return null;
  const tpl = CARDS[watcher.tplId] || null;
  return {
    tplId: watcher.tplId,
    name: tpl?.name || 'Существо',
    owner: watcher.owner,
    r: watcher.r,
    c: watcher.c,
  };
}

export function collectForcedDiscardEvents(state, deaths, context = {}) {
  const events = [];
  const logLines = [];
  if (!state || !Array.isArray(deaths) || !deaths.length) {
    return { events, logLines };
  }

  const boardBefore = Array.isArray(context.boardBefore)
    ? context.boardBefore
    : null;
  const watchers = collectActiveWatchers(boardBefore || state.board);

  for (const death of deaths) {
    if (!death) continue;
    const tplDead = CARDS[death.tplId];
    const cellElement = normalizeElementName(death.field || state?.board?.[death.r]?.[death.c]?.element);

    if (tplDead?.forcedDiscardOnDeath) {
      const cfgRaw = Array.isArray(tplDead.forcedDiscardOnDeath)
        ? tplDead.forcedDiscardOnDeath
        : [tplDead.forcedDiscardOnDeath];
      for (const raw of cfgRaw) {
        if (!raw) continue;
        const condition = normalizeFieldCondition(raw.condition || raw.fieldCondition || raw.whenField);
        if (!matchesFieldCondition(cellElement, condition)) continue;
        const countCfg = normalizeCountConfig(raw.count ?? raw.amount ?? raw.cards);
        if (!countCfg) continue;
        const owner = death.owner;
        if (owner == null) continue;
        const target = owner === 0 ? 1 : 0;
        const amount = resolveCountValue(state, countCfg, { selfPos: { r: death.r, c: death.c } });
        if (amount <= 0) continue;
        const player = state.players?.[target];
        const handCount = Array.isArray(player?.hand) ? player.hand.length : 0;
        if (handCount <= 0) {
          logLines.push(`${tplDead.name}: противник не имеет карт для сброса.`);
          continue;
        }
        const effective = Math.min(amount, handCount);
        const event = createDiscardEvent(state, {
          target,
          amount: effective,
          source: makeSourceFromDeath(death),
          reason: {
            type: 'UNIT_DEATH',
            cause: context.cause || 'ATTACK',
            via: 'ON_DEATH',
            field: cellElement,
            death: { tplId: death.tplId, owner: death.owner, r: death.r, c: death.c },
          },
          prompt: raw.prompt || null,
        });
        if (event) {
          events.push(event);
          const suffix = effective < amount ? ` (доступно ${effective} из ${amount})` : '';
          const elementNote = countCfg.type === 'FIELD_ELEMENT'
            ? ` (${countFieldsByElement(state, countCfg.element, { selfPos: { r: death.r, c: death.c }, includeCenter: countCfg.includeCenter, includeSelf: countCfg.includeSelf })} полей)`
            : '';
          logLines.push(`${tplDead.name}: противник сбрасывает ${effective} карт(ы)${elementNote}${suffix}.`);
        }
      }
    }

    for (const watcher of watchers) {
      if (!watcher) continue;
      if (death.owner !== watcher.owner) continue;
      if (!watcher.cfg.includeSelf && watcher.r === death.r && watcher.c === death.c) continue;
      const player = state.players?.[(watcher.owner === 0 ? 1 : 0)];
      const handCount = Array.isArray(player?.hand) ? player.hand.length : 0;
      if (handCount <= 0) continue;
      const amount = resolveCountValue(state, watcher.cfg.countCfg, { selfPos: { r: watcher.r, c: watcher.c } });
      if (amount <= 0) continue;
      const effective = Math.min(amount, handCount);
      if (effective <= 0) continue;
      const event = createDiscardEvent(state, {
        target: watcher.owner === 0 ? 1 : 0,
        amount: effective,
        source: makeSourceFromWatcher(watcher),
        reason: {
          type: 'UNIT_DEATH',
          cause: context.cause || 'ATTACK',
          via: 'ALLY_DEATH',
          ally: { tplId: death.tplId, owner: death.owner, r: death.r, c: death.c },
        },
      });
      if (event) {
        events.push(event);
        const src = CARDS[watcher.tplId]?.name || 'Существо';
        logLines.push(`${src}: эффект заставляет противника сбросить ${effective} карт(ы).`);
      }
    }
  }

  return { events, logLines };
}

export default { collectForcedDiscardEvents };
