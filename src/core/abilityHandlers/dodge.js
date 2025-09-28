// Модуль обработки ключевого слова "dodge" и его вариаций
import { CARDS } from '../cards.js';

function clampChance(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function normalizeChanceValue(value, defaultChance = 0.5) {
  if (value == null) return defaultChance;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return defaultChance;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return defaultChance;
    if (parsed < 0) return defaultChance;
    if (parsed > 1) return 1;
    return parsed;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultChance;
  if (num < 0) return defaultChance;
  if (num > 1) return 1;
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

  const normalizedChance = normalizeChanceValue(chance, 0.5);
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
  const chance = normalizeChanceValue(cfg.chance, 0.5);
  const max = limited ? Math.max(0, Math.floor(cfg.successes ?? 0)) : null;
  const existing = unit.dodgeState;
  if (existing && existing.version === 1 && existing.keyword === cfg.keyword &&
      existing.limited === limited && existing.max === max && existing.chance === chance) {
    return existing;
  }

  const prevState = (existing && existing.version === 1) ? existing : null;
  const state = prevState || {};

  state.version = 1;
  state.keyword = cfg.keyword;
  state.chance = chance;
  state.limited = limited;

  if (limited) {
    const normalizedMax = max ?? 0;
    const prevWasLimited = !!(prevState && prevState.limited);
    const prevMax = prevWasLimited && Number.isFinite(prevState.max)
      ? Math.max(0, Math.floor(prevState.max))
      : 0;
    let prevRemaining = 0;
    if (prevWasLimited) {
      if (Number.isFinite(prevState.remaining)) {
        prevRemaining = Math.max(0, Math.min(prevMax, Math.floor(prevState.remaining)));
      } else if (Number.isFinite(prevState.successesUsed)) {
        const consumed = Math.max(0, Math.min(prevMax, Math.floor(prevState.successesUsed)));
        prevRemaining = Math.max(0, prevMax - consumed);
      } else {
        prevRemaining = prevMax;
      }
    }

    let remaining;
    if (prevWasLimited) {
      // сохраняем уже израсходованные попытки, добавляя только прирост от новых источников
      if (normalizedMax >= prevMax) {
        const growth = normalizedMax - prevMax;
        remaining = Math.min(normalizedMax, prevRemaining + growth);
      } else {
        remaining = Math.min(normalizedMax, prevRemaining);
      }
    } else {
      remaining = normalizedMax;
    }

    state.max = normalizedMax;
    state.remaining = remaining;
    const consumed = normalizedMax - remaining;
    state.successesUsed = Math.max(0, Math.min(normalizedMax, consumed));
  } else {
    state.max = null;
    state.remaining = null;
    if (Number.isFinite(prevState?.successesUsed)) {
      state.successesUsed = prevState.successesUsed;
    } else {
      state.successesUsed = 0;
    }
  }

  if (prevState && prevState.lastSuccessTurn != null) {
    state.lastSuccessTurn = prevState.lastSuccessTurn;
  } else if (state.lastSuccessTurn != null && !Number.isFinite(state.lastSuccessTurn)) {
    delete state.lastSuccessTurn;
  }

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
  let stateObj = unit.dodgeState;

  if (!stateObj) {
    const cfg = getDodgeConfig(tpl);
    if (!cfg) {
      return { success: false, reason: 'NO_DODGE' };
    }

    stateObj = ensureDodgeState(unit, tpl, cfg);
    if (!stateObj) {
      return { success: false, reason: 'NO_STATE' };
    }
  } else {
    // нормализуем ранее сохранённое состояние, чтобы гарантировать шанс 50%
    stateObj.chance = normalizeChanceValue(stateObj.chance, 0.5);
    if (typeof stateObj.limited !== 'boolean') {
      const hasLimit = stateObj.max != null || stateObj.remaining != null || stateObj.successes != null;
      stateObj.limited = !!hasLimit;
    }
    if (stateObj.limited) {
      if (stateObj.remaining != null && Number.isFinite(stateObj.remaining)) {
        stateObj.remaining = Math.max(0, Math.floor(stateObj.remaining));
      }
      if (stateObj.max != null && Number.isFinite(stateObj.max)) {
        stateObj.max = Math.max(0, Math.floor(stateObj.max));
      }
    } else {
      stateObj.remaining = null;
      stateObj.max = null;
    }
    if (!stateObj.keyword) {
      stateObj.keyword = stateObj.limited ? 'DODGE_ATTEMPT' : 'DODGE';
    }
    stateObj.version = 1;
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
