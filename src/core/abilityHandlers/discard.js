// Логика эффектов принудительного сброса карт и прочих реакций на смерть
import { CARDS } from '../cards.js';
import { applyDeathManaSteal } from './manaSteal.js';
import { applyDeathRepositionEffects } from './deathReposition.js';

const DEFAULT_TIMER_MS = 20000;

function ensureQueue(state) {
  if (!state) return null;
  if (!Array.isArray(state.pendingDiscards)) {
    state.pendingDiscards = [];
  }
  return state.pendingDiscards;
}

function nextRequestId(state) {
  if (!state) return Date.now();
  const current = Number(state.nextDiscardRequestId) || 0;
  const next = current + 1;
  state.nextDiscardRequestId = next;
  return next;
}

function normalizeDeathConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: raw.toUpperCase() };
  }
  if (typeof raw === 'object') {
    const cfg = { ...raw };
    if (cfg.element) cfg.element = String(cfg.element).toUpperCase();
    if (cfg.count == null && typeof cfg.amount === 'number') {
      cfg.count = cfg.amount;
    }
    return cfg;
  }
  return null;
}

function normalizeWatcherConfig(raw) {
  const cfg = normalizeDeathConfig(raw);
  if (!cfg) return null;
  cfg.amount = typeof cfg.amount === 'number' ? cfg.amount : (typeof cfg.count === 'number' ? cfg.count : 1);
  if (cfg.element) cfg.element = String(cfg.element).toUpperCase();
  return cfg;
}

function resolveCount(spec, state) {
  if (spec == null) return 0;
  if (typeof spec === 'number') return Math.max(0, Math.floor(spec));
  if (typeof spec === 'object') {
    const type = String(spec.type || spec.mode || '').toUpperCase();
    if (type === 'FIELD_COUNT' || type === 'FIELDS') {
      const element = String(spec.element || spec.field || '').toUpperCase();
      if (!state?.board || !element) return 0;
      let count = 0;
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          if (state.board?.[r]?.[c]?.element === element) count += 1;
        }
      }
      return count;
    }
    if (type === 'FIXED' || type === 'CONST') {
      if (typeof spec.value === 'number') return Math.max(0, Math.floor(spec.value));
    }
  }
  return 0;
}

function makeRequest(state, opts) {
  const queue = ensureQueue(state);
  if (!queue) return null;
  const { target, count, source, durationMs = DEFAULT_TIMER_MS } = opts;
  const targetPlayer = state?.players?.[target];
  const handSize = Array.isArray(targetPlayer?.hand) ? targetPlayer.hand.length : 0;
  const remaining = Math.min(Math.max(0, count), handSize);
  if (remaining <= 0) {
    return { skipped: true, handSize, requested: count };
  }
  const request = {
    id: nextRequestId(state),
    target,
    requested: count,
    remaining,
    source: source ? { ...source } : null,
    autoRandomMs: durationMs,
  };
  queue.push(request);
  return request;
}

function formatCount(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n === 1) return '1 карту';
  if (n >= 2 && n <= 4) return `${n} карты`;
  return `${n} карт`;
}

export function applyDeathDiscardEffects(state, deaths = [], context = {}) {
  const events = { logs: [], requests: [] };
  if (!state || !Array.isArray(deaths) || deaths.length === 0) return events;

  const reposition = applyDeathRepositionEffects(state, deaths, context);
  if (Array.isArray(reposition?.logs) && reposition.logs.length) {
    events.logs.push(...reposition.logs);
  }
  if (Array.isArray(reposition?.moves) && reposition.moves.length) {
    events.repositions = reposition.moves.slice();
  }

  const queue = ensureQueue(state);
  if (!queue) return events;

  const manaSteals = applyDeathManaSteal(state, deaths, context);
  if (Array.isArray(manaSteals) && manaSteals.length) {
    events.manaSteals = [...manaSteals];
    for (const steal of manaSteals) {
      if (steal?.log) events.logs.push(steal.log);
    }
  }

  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const fieldElement = death.element || state?.board?.[death.r]?.[death.c]?.element || null;
    const baseSource = {
      tplId: tpl.id,
      name: tpl.name || tpl.id,
      owner: death.owner,
    };

    const cfgOn = normalizeDeathConfig(tpl.deathDiscardOnElement);
    if (cfgOn?.element && fieldElement === cfgOn.element) {
      const count = resolveCount(cfgOn.count ?? cfgOn.amount ?? 0, state);
      const target = death.owner === 0 ? 1 : 0;
      const req = makeRequest(state, { target, count, source: baseSource, durationMs: cfgOn.durationMs || DEFAULT_TIMER_MS });
      if (req?.skipped) {
        events.logs.push(`${baseSource.name}: оппоненту нечего сбрасывать.`);
      } else if (req) {
        events.requests.push(req);
        const label = formatCount(req.remaining);
        if (req.remaining < (req.requested || req.remaining)) {
          events.logs.push(`${baseSource.name}: оппонент сбрасывает ${label} (доступных карт меньше требуемого).`);
        } else {
          events.logs.push(`${baseSource.name}: оппонент сбрасывает ${label}.`);
        }
      }
    }

    const cfgOff = normalizeDeathConfig(tpl.deathDiscardOnNonElement);
    if (cfgOff?.element && fieldElement && fieldElement !== cfgOff.element) {
      const count = resolveCount(cfgOff.count ?? cfgOff.amount ?? 0, state);
      const target = death.owner === 0 ? 1 : 0;
      const req = makeRequest(state, { target, count, source: baseSource, durationMs: cfgOff.durationMs || DEFAULT_TIMER_MS });
      if (req?.skipped) {
        events.logs.push(`${baseSource.name}: оппоненту нечего сбрасывать.`);
      } else if (req) {
        events.requests.push(req);
        const label = formatCount(req.remaining);
        if (req.remaining < (req.requested || req.remaining)) {
          events.logs.push(`${baseSource.name}: оппонент сбрасывает ${label} (доступных карт меньше требуемого).`);
        } else {
          events.logs.push(`${baseSource.name}: оппонент сбрасывает ${label}.`);
        }
      }
    }
  }

  const watchers = [];

  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const cfg = normalizeWatcherConfig(tpl.allyDeathDiscardOnElement);
      if (!cfg) continue;
      const elementHere = state.board?.[r]?.[c]?.element || null;
      if (cfg.element && elementHere !== cfg.element) continue;
      watchers.push({ owner: unit.owner, amount: cfg.amount ?? 1, source: { tplId: tpl.id, name: tpl.name || tpl.id, owner: unit.owner } });
    }
  }

  for (const death of deaths) {
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const cfg = normalizeWatcherConfig(tpl.allyDeathDiscardOnElement);
    if (!cfg) continue;
    const element = death.element || state?.board?.[death.r]?.[death.c]?.element || null;
    if (cfg.element && element !== cfg.element) continue;
    watchers.push({ owner: death.owner, amount: cfg.amount ?? 1, source: { tplId: tpl.id, name: tpl.name || tpl.id, owner: death.owner } });
  }

  if (watchers.length) {
    const alliedDeathCount = new Map();
    for (const death of deaths) {
      if (death?.owner == null) continue;
      alliedDeathCount.set(death.owner, (alliedDeathCount.get(death.owner) || 0) + 1);
    }
    for (const watcher of watchers) {
      const deathsForOwner = alliedDeathCount.get(watcher.owner) || 0;
      if (deathsForOwner <= 0) continue;
      const total = deathsForOwner * (watcher.amount || 1);
      if (total <= 0) continue;
      const target = watcher.owner === 0 ? 1 : 0;
      const req = makeRequest(state, { target, count: total, source: watcher.source, durationMs: DEFAULT_TIMER_MS });
      if (req?.skipped) {
        events.logs.push(`${watcher.source.name}: оппоненту нечего сбрасывать.`);
      } else if (req) {
        events.requests.push(req);
        const label = formatCount(req.remaining);
        events.logs.push(`${watcher.source.name}: оппонент сбрасывает ${label}.`);
      }
    }
  }

  return events;
}

export default applyDeathDiscardEffects;
