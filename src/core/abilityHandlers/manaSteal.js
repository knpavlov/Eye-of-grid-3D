// Логика эффектов кражи маны (без визуализации)
import { CARDS } from '../cards.js';
import { capMana, inBounds } from '../constants.js';

function toElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function normalizeStealConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { amount: raw };
  }
  if (typeof raw === 'object') {
    const cfg = { ...raw };
    if (cfg.count != null && cfg.amount == null && typeof cfg.count === 'number') {
      cfg.amount = cfg.count;
    }
    if (cfg.value != null && cfg.amount == null && typeof cfg.value === 'number') {
      cfg.amount = cfg.value;
    }
    cfg.ifOnElement = toElement(cfg.ifOnElement || cfg.onlyOnElement || cfg.requireElement);
    cfg.ifNotOnElement = toElement(cfg.ifNotOnElement || cfg.forbidElement);
    cfg.requireCause = cfg.requireCause
      ? new Set([].concat(cfg.requireCause).map(v => String(v).toUpperCase()))
      : null;
    cfg.causes = cfg.causes
      ? new Set([].concat(cfg.causes).map(v => String(v).toUpperCase()))
      : cfg.requireCause;
    cfg.amount = cfg.amount != null ? cfg.amount : 0;
    cfg.from = cfg.from != null ? cfg.from : cfg.fromPlayer;
    cfg.to = cfg.to != null ? cfg.to : (cfg.toPlayer != null ? cfg.toPlayer : cfg.recipient);
    return cfg;
  }
  return null;
}

function resolvePlayerIndex(owner, spec, fallback = null) {
  if (spec == null) return fallback;
  if (typeof spec === 'number') return spec;
  const key = String(spec).toUpperCase();
  if (key === 'OWNER' || key === 'SELF' || key === 'ALLY' || key === 'SUMMONER') {
    return owner;
  }
  if (key === 'OPPONENT' || key === 'ENEMY' || key === 'RIVAL') {
    return owner === 0 ? 1 : 0;
  }
  return fallback;
}

function countFields(state, element) {
  if (!state?.board || !element) return 0;
  let count = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    for (let c = 0; c < state.board[r].length; c += 1) {
      if (!inBounds(r, c)) continue;
      if (toElement(state.board[r][c]?.element) === element) count += 1;
    }
  }
  return count;
}

function resolveAmount(state, spec, ctx = {}) {
  if (spec == null) return 0;
  if (typeof spec === 'number') {
    return Math.max(0, Math.floor(spec));
  }
  if (typeof spec === 'object') {
    const type = String(spec.type || spec.mode || '').toUpperCase();
    if (type === 'FIELD_COUNT' || type === 'FIELDS') {
      const el = toElement(spec.element || spec.field || ctx.fieldElement);
      return countFields(state, el);
    }
    if (type === 'CONST' || type === 'FIXED') {
      if (typeof spec.value === 'number') {
        return Math.max(0, Math.floor(spec.value));
      }
    }
    if (spec.amount != null) {
      return resolveAmount(state, spec.amount, ctx);
    }
  }
  return 0;
}

export function stealMana(state, opts = {}) {
  const result = {
    from: opts.from ?? null,
    to: opts.to ?? null,
    requested: Math.max(0, Math.floor(opts.amount || 0)),
    attempted: 0,
    stolen: 0,
    fromBefore: null,
    fromAfter: null,
    toBefore: null,
    toAfter: null,
    source: opts.source ? { ...opts.source } : null,
  };
  if (!state?.players || result.requested <= 0) return result;
  const fromIndex = (typeof opts.from === 'number') ? opts.from : null;
  const toIndex = (typeof opts.to === 'number') ? opts.to : null;
  if (fromIndex == null || toIndex == null) return result;
  const fromPlayer = state.players[fromIndex];
  const toPlayer = state.players[toIndex];
  if (!fromPlayer || !toPlayer) return result;

  const fromBefore = Math.max(0, Math.floor(fromPlayer.mana || 0));
  const toBefore = Math.max(0, Math.floor(toPlayer.mana || 0));
  const capacity = Math.max(0, (toPlayer.maxMana != null ? toPlayer.maxMana : 10) - toBefore);
  const maxStealable = Math.min(result.requested, fromBefore);
  const transferable = Math.min(maxStealable, capacity);

  result.fromBefore = fromBefore;
  result.toBefore = toBefore;
  result.attempted = maxStealable;
  result.stolen = transferable;

  const fromAfter = Math.max(0, fromBefore - transferable);
  const toAfter = capMana(toBefore + transferable);

  fromPlayer.mana = fromAfter;
  toPlayer.mana = toAfter;

  result.fromAfter = fromAfter;
  result.toAfter = toAfter;
  return result;
}

export function applySummonManaSteal(state, r, c, context = {}) {
  const events = { steals: [], logs: [] };
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return events;
  const tpl = CARDS[unit.tplId];
  const cfgRaw = tpl?.manaStealOnSummon;
  const cfg = normalizeStealConfig(cfgRaw);
  if (!cfg) return events;

  const fieldElement = toElement(cell?.element);
  if (cfg.ifOnElement && fieldElement !== cfg.ifOnElement) return events;
  if (cfg.ifNotOnElement && fieldElement === cfg.ifNotOnElement) return events;

  const cause = String(context?.cause || 'SUMMON').toUpperCase();
  if (cfg.causes && !cfg.causes.has(cause)) return events;

  const owner = unit.owner;
  const fromIndex = resolvePlayerIndex(owner, cfg.from, owner === 0 ? 1 : 0);
  const toIndex = resolvePlayerIndex(owner, cfg.to, owner);
  const amount = resolveAmount(state, cfg.amount, { fieldElement, unit, tpl, owner });
  if (amount <= 0) return events;

  const steal = stealMana(state, {
    amount,
    from: fromIndex,
    to: toIndex,
    source: {
      tplId: tpl?.id || null,
      name: tpl?.name || 'Существо',
      owner,
      trigger: 'SUMMON',
      position: { r, c },
    },
  });
  if (steal.attempted > 0) {
    events.steals.push(steal);
    if (steal.stolen > 0) {
      const fromLabel = (steal.from ?? fromIndex) + 1;
      const toLabel = (steal.to ?? toIndex) + 1;
      const name = tpl?.name || 'Существо';
      events.logs.push(`${name}: игрок ${toLabel} крадёт ${steal.stolen} маны у игрока ${fromLabel}.`);
    } else {
      const name = tpl?.name || 'Существо';
      events.logs.push(`${name}: попытка украсть ману не удалась.`);
    }
  }
  return events;
}

export function applyDeathManaSteal(state, deaths = [], context = {}) {
  const events = { steals: [], logs: [] };
  if (!state || !Array.isArray(deaths) || !deaths.length) return events;
  const cause = String(context?.cause || 'DEATH').toUpperCase();

  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const cfgRaw = tpl.manaStealOnDeath;
    const cfg = normalizeStealConfig(cfgRaw);
    if (!cfg) continue;
    if (cfg.causes && !cfg.causes.has(cause)) continue;

    const fieldElement = toElement(death.element || state?.board?.[death.r]?.[death.c]?.element);
    if (cfg.ifOnElement && fieldElement !== cfg.ifOnElement) continue;
    if (cfg.ifNotOnElement && fieldElement === cfg.ifNotOnElement) continue;

    const owner = death.owner;
    const fromIndex = resolvePlayerIndex(owner, cfg.from, owner === 0 ? 1 : 0);
    const toIndex = resolvePlayerIndex(owner, cfg.to, owner);
    const amount = resolveAmount(state, cfg.amount, { fieldElement, owner, death, tpl });
    if (amount <= 0) continue;

    const steal = stealMana(state, {
      amount,
      from: fromIndex,
      to: toIndex,
      source: {
        tplId: tpl?.id || null,
        name: tpl?.name || 'Существо',
        owner,
        trigger: 'DEATH',
        cause,
        position: { r: death.r, c: death.c },
      },
    });
    if (steal.attempted <= 0) continue;
    events.steals.push(steal);
    if (steal.stolen > 0) {
      const fromLabel = (steal.from ?? fromIndex) + 1;
      const toLabel = (steal.to ?? toIndex) + 1;
      const name = tpl?.name || 'Существо';
      events.logs.push(`${name}: игрок ${toLabel} крадёт ${steal.stolen} маны у игрока ${fromLabel}.`);
    } else {
      const name = tpl?.name || 'Существо';
      events.logs.push(`${name}: попытка украсть ману не удалась.`);
    }
  }

  return events;
}

export default {
  stealMana,
  applySummonManaSteal,
  applyDeathManaSteal,
};
