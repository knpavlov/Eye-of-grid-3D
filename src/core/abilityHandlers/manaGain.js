// Модуль обработки эффектов прироста маны (чистая игровая логика)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;
const capMana = (m) => Math.min(10, m);

function normalizeElement(value, fallback = null) {
  const normalized = normalizeElementName(typeof value === 'string' ? value : null);
  if (normalized) return normalized;
  if (fallback && typeof fallback === 'string') {
    return normalizeElementName(fallback);
  }
  return null;
}

function normalizeManaGainConfig(raw, tpl) {
  if (raw == null) {
    if (tpl?.manaGainOnNonElement === true) {
      return {
        element: normalizeElement(tpl.element),
        amount: 1,
      };
    }
    return null;
  }
  if (typeof raw === 'string') {
    return {
      element: normalizeElement(raw, tpl?.element),
      amount: 1,
    };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return {
      element: normalizeElement(tpl?.element),
      amount,
    };
  }
  if (typeof raw === 'object') {
    const element = normalizeElement(
      raw.element || raw.base || raw.reference || raw.field,
      tpl?.element,
    );
    const amountRaw = raw.amount || raw.value || raw.plus || raw.gain;
    const amount = Math.max(0, Math.floor(Number.isFinite(amountRaw) ? amountRaw : 1));
    if (!element || amount <= 0) return null;
    return { element, amount };
  }
  return null;
}

function isUnitAlive(unit, tpl) {
  const current = typeof unit?.currentHP === 'number' ? unit.currentHP : null;
  const baseHp = tpl?.hp;
  if (current != null) return current > 0;
  if (typeof baseHp === 'number') return baseHp > 0;
  return true;
}

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(num));
}

function gainMana(state, playerIndex, amount) {
  if (!state?.players || !state.players[playerIndex]) return 0;
  const delta = toPositiveInt(amount);
  if (delta <= 0) return 0;
  const player = state.players[playerIndex];
  const before = typeof player.mana === 'number' ? player.mana : 0;
  const after = capMana(before + delta);
  player.mana = after;
  return after - before;
}

function countEnemyUnits(boardState, owner) {
  if (!boardState?.board) return 0;
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const unit = boardState.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      if (owner != null && unit.owner === owner) continue;
      count += 1;
    }
  }
  return count;
}

function countFieldsOfElement(boardState, element) {
  if (!boardState?.board) return 0;
  const normalized = normalizeElementName(element);
  if (!normalized) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cellElement = normalizeElementName(boardState.board?.[r]?.[c]?.element);
      if (cellElement && cellElement === normalized) {
        total += 1;
      }
    }
  }
  return total;
}

function normalizeDeathGainConfig(raw, tpl) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    const amount = toPositiveInt(raw);
    if (amount <= 0) return null;
    return { mode: 'CONSTANT', base: amount };
  }
  if (typeof raw === 'string') {
    const token = raw.trim().toUpperCase();
    if (!token) return null;
    if (token === 'ENEMIES' || token === 'ENEMY_UNITS' || token === 'ENEMY_COUNT') {
      return { mode: 'COUNT_ENEMY_UNITS', per: 1, base: 0 };
    }
    if (token.endsWith('_FIELDS')) {
      const element = normalizeElementName(token.replace(/_FIELDS$/, ''));
      if (element) {
        return { mode: 'COUNT_FIELDS_OF_ELEMENT', element, per: 1, base: 0 };
      }
    }
    return null;
  }
  if (typeof raw === 'object') {
    const modeRaw = raw.mode || raw.type || raw.count || raw.by || null;
    const base = toPositiveInt(raw.base ?? raw.amount ?? raw.plus ?? raw.value ?? 0);
    const per = toPositiveInt(raw.per ?? raw.multiplier ?? raw.factor ?? 1, 1) || 1;
    const max = raw.max != null ? toPositiveInt(raw.max) : null;
    const min = raw.min != null ? toPositiveInt(raw.min) : null;
    if (modeRaw === 'CONSTANT') {
      const amount = base > 0 ? base : toPositiveInt(raw.amount ?? raw.total ?? 0);
      if (amount <= 0) return null;
      return { mode: 'CONSTANT', base: amount };
    }
    if (modeRaw === 'ENEMIES' || modeRaw === 'ENEMY_UNITS' || modeRaw === 'COUNT_ENEMY_UNITS') {
      return { mode: 'COUNT_ENEMY_UNITS', base, per: per || 1, max, min };
    }
    if (modeRaw === 'FIELDS' || modeRaw === 'FIELD_ELEMENT' || modeRaw === 'ELEMENT_FIELDS' || modeRaw === 'COUNT_FIELDS_OF_ELEMENT') {
      const element = normalizeElementName(raw.element || tpl?.element || null);
      if (!element) return null;
      return { mode: 'COUNT_FIELDS_OF_ELEMENT', element, base, per: per || 1, max, min };
    }
    if (!modeRaw && raw.element) {
      const element = normalizeElementName(raw.element);
      if (element) {
        return { mode: 'COUNT_FIELDS_OF_ELEMENT', element, base, per: per || 1, max, min };
      }
    }
  }
  return null;
}

function clampWithBounds(value, min, max) {
  let result = value;
  if (typeof min === 'number') {
    result = Math.max(result, min);
  }
  if (typeof max === 'number') {
    result = Math.min(result, max);
  }
  return result;
}

function computeDeathGainAmount(boardState, death, cfg) {
  if (!cfg) return 0;
  if (cfg.mode === 'CONSTANT') {
    return toPositiveInt(cfg.base);
  }
  if (cfg.mode === 'COUNT_ENEMY_UNITS') {
    const per = cfg.per || 1;
    const count = countEnemyUnits(boardState, death?.owner);
    const base = cfg.base || 0;
    const amount = base + per * count;
    return clampWithBounds(amount, cfg.min, cfg.max);
  }
  if (cfg.mode === 'COUNT_FIELDS_OF_ELEMENT') {
    const per = cfg.per || 1;
    const element = cfg.element;
    if (!element) return 0;
    const total = countFieldsOfElement(boardState, element);
    const base = cfg.base || 0;
    const amount = base + per * total;
    return clampWithBounds(amount, cfg.min, cfg.max);
  }
  return 0;
}

function isAdjacent(r1, c1, r2, c2) {
  if ([r1, c1, r2, c2].some(v => v == null)) return false;
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function normalizeAllyDeathConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const amount = toPositiveInt(raw);
    if (amount <= 0) return null;
    return { amount, requireAdjacent: false, requireWatcherFieldElement: null };
  }
  if (typeof raw === 'object') {
    const amount = toPositiveInt(raw.amount ?? raw.plus ?? raw.value ?? raw.per ?? 1, 1);
    if (amount <= 0) return null;
    const requireAdjacent = !!(raw.requireAdjacent || raw.adjacent || raw.adjacency === 'ORTHOGONAL');
    const watcherElement = raw.requireFieldElement || raw.watcherElement || raw.sourceElement || null;
    const normalizedElement = watcherElement ? normalizeElementName(watcherElement) : null;
    return {
      amount,
      requireAdjacent,
      requireWatcherFieldElement: normalizedElement,
    };
  }
  return null;
}

function collectAllyDeathWatchers(boardState) {
  const watchers = [];
  if (!boardState?.board) return watchers;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = boardState.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const cfg = normalizeAllyDeathConfig(tpl.allyDeathGainMana);
      if (!cfg) continue;
      const fieldElement = normalizeElementName(cell?.element);
      if (cfg.requireWatcherFieldElement && cfg.requireWatcherFieldElement !== fieldElement) continue;
      watchers.push({
        owner: unit.owner,
        r,
        c,
        amount: cfg.amount,
        requireAdjacent: cfg.requireAdjacent,
        tplId: tpl.id,
        name: tpl.name || tpl.id,
      });
    }
  }
  return watchers;
}

export function applyTurnStartManaEffects(state, playerIndex) {
  const result = { total: 0, entries: [] };
  if (!state?.board || !Array.isArray(state.board)) return result;
  const player = state.players?.[playerIndex];
  if (!player) return result;

  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit || unit.owner !== playerIndex) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (!isUnitAlive(unit, tpl)) continue;
      const cfg = normalizeManaGainConfig(tpl.manaGainOnNonElement, tpl);
      if (!cfg) continue;
      const nativeElement = normalizeElement(cfg.element || tpl.element);
      if (!nativeElement) continue;
      const cellElement = normalizeElement(cell?.element || null);
      if (cellElement === nativeElement) continue;
      const gained = gainMana(state, playerIndex, cfg.amount || 0);
      if (gained > 0) {
        result.total += gained;
        result.entries.push({
          r,
          c,
          tplId: tpl.id,
          amount: gained,
          fieldElement: cellElement,
        });
      }
    }
  }

  return result;
}

export function applyManaGainOnDeaths(state, deaths, opts = {}) {
  const result = { total: 0, entries: [], logs: [] };
  if (!state?.players || !Array.isArray(deaths) || deaths.length === 0) {
    return result;
  }
  const boardState = opts.boardState || state;

  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const cfg = normalizeDeathGainConfig(tpl.gainManaOnDeath, tpl);
    if (!cfg) continue;
    const amount = computeDeathGainAmount(boardState, death, cfg);
    if (amount <= 0) continue;
    const gained = gainMana(state, death.owner, amount);
    if (gained <= 0) continue;
    result.total += gained;
    result.entries.push({
      type: 'SELF_DEATH',
      owner: death.owner,
      amount: gained,
      sourceTplId: tpl.id,
      sourceName: tpl.name || tpl.id,
      death,
    });
    const playerLabel = (death.owner != null) ? death.owner + 1 : '?';
    result.logs.push(`${tpl.name || tpl.id}: игрок ${playerLabel} получает +${gained} маны за разрушение.`);
  }

  const watchers = collectAllyDeathWatchers(boardState);
  if (watchers.length) {
    for (const death of deaths) {
      if (!death || death.owner == null) continue;
      for (const watcher of watchers) {
        if (watcher.owner !== death.owner) continue;
        if (watcher.requireAdjacent && !isAdjacent(watcher.r, watcher.c, death.r, death.c)) continue;
        const gained = gainMana(state, watcher.owner, watcher.amount);
        if (gained <= 0) continue;
        result.total += gained;
        result.entries.push({
          type: 'ALLY_DEATH',
          owner: watcher.owner,
          amount: gained,
          sourceTplId: watcher.tplId,
          sourceName: watcher.name,
          watcher: { r: watcher.r, c: watcher.c },
          death,
        });
        const playerLabel = watcher.owner + 1;
        result.logs.push(`${watcher.name}: игрок ${playerLabel} получает +${gained} маны за гибель союзника.`);
      }
    }
  }

  return result;
}

export default {
  applyTurnStartManaEffects,
  applyManaGainOnDeaths,
};
