// Модуль обработки ключевого слова "dodge" и его вариаций
import { CARDS } from '../cards.js';

function clampChance(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function normalizeAttempts(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  return Math.floor(num);
}

function resolveDodgeSource(tpl) {
  if (!tpl) return null;
  if (tpl.dodge != null) return tpl.dodge;
  if (tpl.dodge50) return { chance: 0.5, keyword: 'DODGE' };
  return null;
}

export function getDodgeConfig(tpl) {
  const source = resolveDodgeSource(tpl);
  if (!source || source === false) return null;

  let chance = 0.5;
  let attempts = null;
  let keyword = null;

  if (source === true) {
    chance = 0.5;
  } else if (typeof source === 'number') {
    attempts = source;
  } else if (typeof source === 'string') {
    const lower = source.toLowerCase();
    if (lower.includes('attempt')) {
      attempts = 1;
    }
  } else if (typeof source === 'object') {
    if (source.chance != null) chance = source.chance;
    else if (source.rate != null) chance = source.rate;
    else if (source.probability != null) chance = source.probability;
    if (source.attempts != null) attempts = source.attempts;
    else if (source.successes != null) attempts = source.successes;
    else if (source.maxSuccesses != null) attempts = source.maxSuccesses;
    else if (source.limit != null) attempts = source.limit;
    if (source.keyword) keyword = source.keyword;
  }

  const normalizedChance = clampChance(chance);
  const normalizedAttempts = normalizeAttempts(attempts);
  const limited = normalizedAttempts != null;
  const normalizedKeyword = keyword
    ? String(keyword).toUpperCase()
    : (limited ? 'DODGE_ATTEMPT' : 'DODGE');

  return {
    chance: normalizedChance,
    successes: normalizedAttempts,
    keyword: normalizedKeyword,
  };
}

export function ensureDodgeState(unit, tpl, configOverride = null) {
  if (!unit) return null;
  const tplRef = tpl || (unit.tplId ? CARDS[unit.tplId] : null);
  const cfg = configOverride || getDodgeConfig(tplRef);
  if (!cfg) {
    if (unit.dodgeState) delete unit.dodgeState;
    return null;
  }

  const limited = cfg.successes != null;
  const max = limited ? cfg.successes : null;
  const existing = unit.dodgeState;
  if (existing && existing.version === 1 && existing.keyword === cfg.keyword &&
      existing.limited === limited && existing.max === max && existing.chance === cfg.chance) {
    return existing;
  }

  const state = {
    version: 1,
    keyword: cfg.keyword,
    chance: cfg.chance,
    limited,
    max,
    baseMax: limited ? max : null,
    remaining: limited ? max : null,
    successesUsed: 0,
  };
  unit.dodgeState = state;
  return state;
}

export function attemptDodge(state, r, c, opts = {}) {
  const board = state?.board;
  if (!board) {
    return { success: false, reason: 'NO_BOARD' };
  }
  const cell = board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) {
    return { success: false, reason: 'NO_UNIT' };
  }
  const tpl = unit.tplId ? CARDS[unit.tplId] : null;
  const cfg = getDodgeConfig(tpl);
  if (!cfg) {
    return { success: false, reason: 'NO_DODGE' };
  }

  const stateObj = ensureDodgeState(unit, tpl, cfg);
  if (!stateObj) {
    return { success: false, reason: 'NO_STATE' };
  }

  const hadAttempts = !stateObj.limited || (stateObj.remaining ?? 0) > 0;
  if (!hadAttempts) {
    return {
      success: false,
      reason: 'EXHAUSTED',
      limited: stateObj.limited,
      attemptsLeft: stateObj.limited ? (stateObj.remaining ?? 0) : null,
      keyword: stateObj.keyword,
      attempted: false,
    };
  }

  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const roll = clampChance(rng());
  const success = roll < stateObj.chance;
  if (success) {
    if (stateObj.limited && stateObj.remaining != null) {
      stateObj.remaining = Math.max(0, stateObj.remaining - 1);
    }
    stateObj.successesUsed = (stateObj.successesUsed || 0) + 1;
    stateObj.lastSuccessTurn = state?.turn ?? null;
  }

  return {
    success,
    roll,
    chance: stateObj.chance,
    limited: stateObj.limited,
    attemptsLeft: stateObj.limited ? (stateObj.remaining ?? 0) : null,
    consumed: success,
    keyword: stateObj.keyword,
    attempted: true,
  };
}

function amountFromConfig(cfg) {
  if (cfg == null) return 0;
  if (typeof cfg === 'number' && Number.isFinite(cfg)) {
    return Math.max(0, Math.floor(cfg));
  }
  if (typeof cfg === 'object') {
    if (typeof cfg.amount === 'number') return Math.max(0, Math.floor(cfg.amount));
    if (typeof cfg.value === 'number') return Math.max(0, Math.floor(cfg.value));
    if (typeof cfg.plus === 'number') return Math.max(0, Math.floor(cfg.plus));
  }
  return 0;
}

const FALLBACK_DODGE_CFG = { chance: 0.5, attempts: 0, keyword: 'DODGE_ATTEMPT' };

function ensureStateWithFallback(unit, tpl) {
  let state = ensureDodgeState(unit, tpl);
  if (!state) {
    state = ensureDodgeState(unit, tpl, FALLBACK_DODGE_CFG);
  }
  return state;
}

function addExtra(map, unit, amount) {
  if (!unit || amount <= 0) return;
  const entry = map.get(unit) || { extra: 0 };
  entry.extra += amount;
  map.set(unit, entry);
}

function normalizeElement(value) {
  if (!value) return null;
  return String(value).toUpperCase();
}

function neighbors(r, c) {
  return [ [r-1, c], [r+1, c], [r, c-1], [r, c+1] ];
}

export function refreshDodgeBonuses(state) {
  if (!state?.board) return;
  const extras = new Map();

  const ensure = ensureStateWithFallback;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = unit.tplId ? CARDS[unit.tplId] : null;
      if (!tpl) continue;
      const stateObj = ensure(unit, tpl);
      if (!stateObj) continue;

      const selfBonus = tpl.dodgeBonusOnElement || tpl.extraDodgeOnElement;
      if (selfBonus) {
        const element = normalizeElement(selfBonus.element || selfBonus);
        const amount = amountFromConfig(selfBonus);
        if (element && amount > 0 && cell.element === element) {
          addExtra(extras, unit, amount);
        }
      }

      if (tpl.dodgeGainPerAdjacentEnemy) {
        const per = amountFromConfig(tpl.dodgeGainPerAdjacentEnemy) || 1;
        let count = 0;
        for (const [nr, nc] of neighbors(r, c)) {
          const neigh = state.board?.[nr]?.[nc]?.unit;
          if (neigh && neigh.owner !== unit.owner) count += 1;
        }
        if (count > 0) addExtra(extras, unit, per * count);
      }

      if (tpl.dodgeAuraAdjacentAllies) {
        const amount = amountFromConfig(tpl.dodgeAuraAdjacentAllies) || 1;
        if (amount > 0) {
          for (const [nr, nc] of neighbors(r, c)) {
            const neigh = state.board?.[nr]?.[nc]?.unit;
            if (!neigh || neigh.owner !== unit.owner || neigh === unit) continue;
            ensure(neigh, CARDS[neigh.tplId]);
            addExtra(extras, neigh, amount);
          }
        }
      }

      if (tpl.dodgeAuraAlliesOnElement) {
        const cfg = tpl.dodgeAuraAlliesOnElement;
        const element = normalizeElement(cfg.element || cfg);
        const amount = amountFromConfig(cfg) || 1;
        const includeSelf = cfg.includeSelf === true;
        if (element && amount > 0) {
          for (let rr = 0; rr < 3; rr++) {
            for (let cc = 0; cc < 3; cc++) {
              const allyCell = state.board?.[rr]?.[cc];
              const ally = allyCell?.unit;
              if (!ally || ally.owner !== unit.owner) continue;
              if (!includeSelf && ally === unit) continue;
              if (allyCell.element !== element) continue;
              ensure(ally, CARDS[ally.tplId]);
              addExtra(extras, ally, amount);
            }
          }
        }
      }
    }
  }

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      const stateObj = unit.dodgeState;
      if (!stateObj) continue;
      const extra = extras.get(unit)?.extra || 0;
      stateObj.bonusAttempts = extra;
      if (!stateObj.limited) continue;
      const base = typeof stateObj.baseMax === 'number' ? stateObj.baseMax : (stateObj.max ?? 0);
      const used = stateObj.successesUsed ?? 0;
      const newMax = Math.max(base, base + extra);
      stateObj.max = newMax;
      if (used > newMax) {
        stateObj.successesUsed = newMax;
        stateObj.remaining = 0;
      } else {
        stateObj.remaining = Math.max(0, newMax - used);
      }
    }
  }
}
