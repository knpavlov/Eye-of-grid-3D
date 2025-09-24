// Логика способностей, связанных со сбросом карт (без UI и анимации)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const DISCARD_TIMER_MS = 20000;

function clampInt(value, fallback = 0) {
  const num = Number.isFinite(value) ? value : fallback;
  const int = Math.floor(num);
  return Number.isFinite(int) ? int : fallback;
}

export function ensurePendingDiscards(state) {
  if (!state) return [];
  if (!Array.isArray(state.pendingDiscards)) state.pendingDiscards = [];
  return state.pendingDiscards;
}

function countFieldsOfElement(state, element) {
  if (!state || !state.board) return 0;
  const normalized = normalizeElementName(element);
  if (!normalized) return 0;
  let count = 0;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (normalizeElementName(state.board?.[r]?.[c]?.element) === normalized) count += 1;
    }
  }
  return count;
}

function resolveDiscardAmount(state, amountCfg) {
  if (amountCfg == null) return 0;
  if (typeof amountCfg === 'number') return clampInt(amountCfg, 0);
  if (typeof amountCfg === 'object') {
    const type = amountCfg.type || amountCfg.kind || null;
    if (type === 'FIELD_COUNT') {
      return countFieldsOfElement(state, amountCfg.element || amountCfg.field || amountCfg.elementType);
    }
  }
  return 0;
}

function createDiscardLogLine(tpl, amount) {
  const name = tpl?.name || tpl?.id || 'Creature';
  const suffix = amount === 1 ? 'card' : 'cards';
  return `${name}: opponent must discard ${amount} ${suffix}.`;
}

export function collectDeathDiscardEffects(state, deaths = []) {
  const requests = [];
  const logLines = [];
  if (!Array.isArray(deaths) || !deaths.length) return { requests, logLines };

  for (const info of deaths) {
    if (!info || !info.tplId) continue;
    const tpl = CARDS[info.tplId];
    const ability = tpl?.deathDiscard;
    if (!ability) continue;
    const cellElement = state?.board?.[info.r]?.[info.c]?.element || null;
    const normCellElement = normalizeElementName(cellElement);
    const requireOn = normalizeElementName(ability.onElement || ability.requireElement || ability.element);
    const requireOff = normalizeElementName(ability.offElement || ability.forbidElement);
    if (requireOn && normCellElement !== requireOn) continue;
    if (requireOff && normCellElement === requireOff) continue;
    const amountRaw = ability.amount != null ? ability.amount : ability.count;
    const amount = resolveDiscardAmount(state, amountRaw);
    if (amount <= 0) continue;
    const target = ability.target === 'SELF'
      ? info.owner
      : (info.owner === 0 ? 1 : 0);
    requests.push({
      target,
      amount,
      source: {
        type: 'ON_DEATH',
        tplId: tpl?.id || info.tplId,
        owner: info.owner,
        position: { r: info.r, c: info.c },
      },
    });
    logLines.push(createDiscardLogLine(tpl, amount));
  }

  return { requests, logLines };
}

export function collectAllyDeathDiscardEffects(state, deaths = []) {
  const requests = [];
  const logLines = [];
  if (!state || !Array.isArray(deaths) || !deaths.length) return { requests, logLines };

  const deathsByOwner = new Map();
  for (const info of deaths) {
    if (!info || typeof info.owner !== 'number') continue;
    deathsByOwner.set(info.owner, (deathsByOwner.get(info.owner) || 0) + 1);
  }
  if (!deathsByOwner.size) return { requests, logLines };

  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      const ability = tpl?.allyDeathDiscard;
      if (!ability) continue;
      const hp = (typeof unit.currentHP === 'number') ? unit.currentHP : tpl?.hp;
      if (hp != null && hp <= 0) continue;
      const cellElement = state.board?.[r]?.[c]?.element || null;
      const requireElement = normalizeElementName(ability.requireElement || ability.onElement || ability.element);
      if (requireElement && normalizeElementName(cellElement) !== requireElement) continue;
      const owner = unit.owner;
      const alliedDeaths = deathsByOwner.get(owner) || 0;
      if (alliedDeaths <= 0) continue;
      const perDeath = ability.amount != null ? ability.amount : 1;
      const amount = clampInt(perDeath * alliedDeaths, 0);
      if (amount <= 0) continue;
      const target = ability.target === 'SELF'
        ? owner
        : (owner === 0 ? 1 : 0);
      requests.push({
        target,
        amount,
        source: {
          type: 'ALLY_DEATH',
          tplId: tpl?.id || unit.tplId,
          owner,
          position: { r, c },
        },
      });
      logLines.push(createDiscardLogLine(tpl, amount));
    }
  }

  return { requests, logLines };
}

export function enqueueDiscardRequests(state, requests = [], opts = {}) {
  if (!state || !Array.isArray(requests) || !requests.length) return { added: [] };
  const queue = ensurePendingDiscards(state);
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const timerMs = typeof opts.timerMs === 'number' ? opts.timerMs : DISCARD_TIMER_MS;
  const added = [];
  for (const req of requests) {
    if (!req) continue;
    const target = typeof req.target === 'number' ? req.target : null;
    if (target == null) continue;
    const amount = clampInt(req.amount ?? req.count ?? req.remaining ?? 0, 0);
    if (amount <= 0) continue;
    const id = req.id || `discard_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      target,
      total: amount,
      remaining: amount,
      resolved: 0,
      source: req.source ? { ...req.source } : null,
      createdAt: now,
      deadline: now + timerMs,
      timerMs,
    };
    queue.push(entry);
    added.push(entry);
  }
  return { added };
}

export function getPendingDiscardById(state, requestId) {
  if (!state || !Array.isArray(state.pendingDiscards)) return null;
  return state.pendingDiscards.find(req => req && req.id === requestId) || null;
}

export function applyDiscardSelection(state, requestId, opts = {}) {
  if (!state || !requestId) return { ok: false, reason: 'NO_STATE' };
  const queue = ensurePendingDiscards(state);
  const idx = queue.findIndex(req => req && req.id === requestId);
  if (idx < 0) return { ok: false, reason: 'NOT_FOUND' };
  const entry = queue[idx];
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  entry.remaining = Math.max(0, clampInt(entry.remaining, entry.total) - 1);
  entry.resolved = (entry.resolved || 0) + 1;
  const completed = entry.remaining <= 0;
  if (completed) {
    queue.splice(idx, 1);
  } else {
    entry.deadline = now + (entry.timerMs || DISCARD_TIMER_MS);
  }
  return { ok: true, completed, remaining: entry.remaining, request: completed ? null : entry };
}

export function resolveDiscardRequestEmpty(state, requestId) {
  if (!state || !requestId) return { ok: false, reason: 'NO_STATE' };
  const queue = ensurePendingDiscards(state);
  const idx = queue.findIndex(req => req && req.id === requestId);
  if (idx < 0) return { ok: false, reason: 'NOT_FOUND' };
  queue.splice(idx, 1);
  return { ok: true, completed: true };
}

export function applyHandDiscard(player, handIdx) {
  if (!player || typeof handIdx !== 'number') return null;
  const hand = Array.isArray(player.hand) ? player.hand : null;
  if (!hand || handIdx < 0 || handIdx >= hand.length) return null;
  const [cardTpl] = hand.splice(handIdx, 1);
  if (cardTpl) {
    player.graveyard = Array.isArray(player.graveyard) ? player.graveyard : [];
    player.graveyard.push(cardTpl);
  }
  return cardTpl || null;
}

export function applyRandomHandDiscard(player, rng = Math.random) {
  if (!player) return { index: -1, card: null };
  const hand = Array.isArray(player.hand) ? player.hand : null;
  const len = hand?.length || 0;
  if (len <= 0) return { index: -1, card: null };
  const roll = rng && typeof rng === 'function' ? rng() : Math.random();
  const idx = Math.max(0, Math.min(len - 1, Math.floor(roll * len)));
  const card = applyHandDiscard(player, idx);
  return { index: idx, card };
}

export { DISCARD_TIMER_MS };

export default {
  ensurePendingDiscards,
  collectDeathDiscardEffects,
  collectAllyDeathDiscardEffects,
  enqueueDiscardRequests,
  applyDiscardSelection,
  resolveDiscardRequestEmpty,
  applyHandDiscard,
  applyRandomHandDiscard,
  getPendingDiscardById,
  DISCARD_TIMER_MS,
};
