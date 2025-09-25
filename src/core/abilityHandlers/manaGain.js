// Модуль для обработки эффектов получения маны (чистая логика)
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;
const DIR_VECTORS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const capMana = (m) => Math.min(10, Math.max(0, Math.floor(m)));

function normalizeElement(value, fallback = null) {
  const normalized = normalizeElementName(typeof value === 'string' ? value : null);
  if (normalized) return normalized;
  if (fallback && typeof fallback === 'string') {
    return normalizeElementName(fallback);
  }
  return null;
}

function toInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.floor(parsed);
  }
  return fallback;
}

export function grantMana(state, owner, amount) {
  if (!state?.players || owner == null) return 0;
  const player = state.players[owner];
  if (!player) return 0;
  const delta = Math.max(0, Math.floor(amount || 0));
  if (delta <= 0) return 0;
  const before = typeof player.mana === 'number' ? player.mana : 0;
  const after = capMana(before + delta);
  player.mana = after;
  return after - before;
}

export function normalizeManaGainConfig(raw, tpl) {
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

function countEnemyUnits(state, owner) {
  if (!state?.board || owner == null) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit) continue;
      if (unit.owner === owner) continue;
      total += 1;
    }
  }
  return total;
}

function countFieldsByElement(state, element) {
  if (!state?.board || !element) return 0;
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const fieldElement = normalizeElement(state.board?.[r]?.[c]?.element || null);
      if (fieldElement === element) total += 1;
    }
  }
  return total;
}

function normalizeDeathManaConfig(raw, tpl) {
  if (raw == null) return null;
  if (raw === true) {
    return { type: 'STATIC', amount: 1 };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { type: 'STATIC', amount };
  }
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if (upper === 'ENEMY_COUNT' || upper === 'ENEMIES') {
      return { type: 'ENEMY_COUNT', per: 1 };
    }
    const numeric = toInt(raw, null);
    if (numeric != null) {
      const amount = Math.max(0, numeric);
      if (amount > 0) return { type: 'STATIC', amount };
    }
    return null;
  }
  if (typeof raw === 'object') {
    const typeToken = (raw.type || raw.kind || raw.mode || raw.source || '').toString().toUpperCase();
    const perRaw = raw.per ?? raw.perUnit ?? raw.perEnemy ?? raw.amountPer ?? 1;
    const per = Math.max(0, Math.floor(Number.isFinite(perRaw) ? perRaw : 1));
    const amountRaw = raw.amount ?? raw.value ?? raw.plus ?? raw.gain ?? null;
    if (typeToken === 'ENEMY_COUNT' || typeToken === 'ENEMIES') {
      return { type: 'ENEMY_COUNT', per: per > 0 ? per : 1 };
    }
    if (typeToken === 'FIELD_COUNT' || typeToken === 'FIELDS') {
      const element = normalizeElement(raw.element || raw.field || raw.elementType || raw.base, tpl?.element);
      if (!element) return null;
      return { type: 'FIELD_COUNT', element, per: per > 0 ? per : 1 };
    }
    if (!typeToken && raw.element) {
      const element = normalizeElement(raw.element, tpl?.element);
      if (!element) return null;
      return { type: 'FIELD_COUNT', element, per: per > 0 ? per : 1 };
    }
    if (amountRaw != null) {
      const amount = Math.max(0, Math.floor(Number(amountRaw)));
      if (amount > 0) {
        return { type: 'STATIC', amount };
      }
    }
  }
  return null;
}

function resolveDeathManaAmount(state, death, tpl, cfg) {
  if (!cfg || !tpl) return null;
  if (cfg.type === 'STATIC') {
    if (cfg.amount > 0) {
      return { amount: cfg.amount, detail: { type: 'STATIC' } };
    }
    return null;
  }
  if (cfg.type === 'ENEMY_COUNT') {
    const per = cfg.per > 0 ? cfg.per : 1;
    const enemies = countEnemyUnits(state, death.owner);
    if (enemies <= 0 || per <= 0) return null;
    return {
      amount: enemies * per,
      detail: { type: 'ENEMY_COUNT', enemies, per },
    };
  }
  if (cfg.type === 'FIELD_COUNT') {
    const per = cfg.per > 0 ? cfg.per : 1;
    const element = normalizeElement(cfg.element, tpl?.element);
    if (!element || per <= 0) return null;
    const fields = countFieldsByElement(state, element);
    if (fields <= 0) return null;
    return {
      amount: fields * per,
      detail: { type: 'FIELD_COUNT', element, fields, per },
    };
  }
  return null;
}

function normalizeAdjacentDeathManaConfig(raw) {
  if (raw == null) return null;
  if (raw === true) return { amount: 1 };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { amount };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.value ?? raw.plus ?? raw.gain ?? 1;
    const amount = Math.max(0, Math.floor(Number.isFinite(amountRaw) ? amountRaw : 1));
    if (amount <= 0) return null;
    const element = normalizeElement(raw.element || raw.onElement || raw.requireElement || raw.field || null);
    return { amount, element };
  }
  return null;
}

function applyDirectDeathMana(state, deaths = []) {
  const result = { total: 0, entries: [], logs: [] };
  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const cfg = normalizeDeathManaConfig(tpl.onDeathGainMana, tpl);
    if (!cfg) continue;
    const resolved = resolveDeathManaAmount(state, death, tpl, cfg);
    if (!resolved || resolved.amount <= 0) continue;
    const gained = grantMana(state, death.owner, resolved.amount);
    if (gained <= 0) continue;
    const entry = {
      type: 'ON_DEATH',
      owner: death.owner,
      amount: gained,
      source: { tplId: tpl.id, name: tpl.name || tpl.id },
      position: { r: death.r, c: death.c },
      detail: resolved.detail || null,
    };
    result.entries.push(entry);
    result.total += gained;
    const ownerLabel = death.owner != null ? `игрок ${death.owner + 1}` : 'игрок';
    const name = tpl.name || tpl.id || 'Существо';
    result.logs.push(`${name}: ${ownerLabel} получает +${gained} маны (способность при гибели).`);
  }
  return result;
}

function applyAdjacentDeathMana(state, deaths = []) {
  const result = { total: 0, entries: [], logs: [] };
  if (!state?.board || !Array.isArray(deaths) || deaths.length === 0) return result;
  for (const death of deaths) {
    if (!death || death.owner == null) continue;
    const seen = new Set();
    for (const vec of Object.values(DIR_VECTORS)) {
      const nr = death.r + vec[0];
      const nc = death.c + vec[1];
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const key = `${nr}:${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cell = state.board?.[nr]?.[nc];
      const unit = cell?.unit;
      if (!unit || unit.owner !== death.owner) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      if (!isUnitAlive(unit, tpl)) continue;
      const cfg = normalizeAdjacentDeathManaConfig(tpl.adjacentAllyDeathManaGain);
      if (!cfg) continue;
      if (cfg.element) {
        const cellElement = normalizeElement(cell?.element || null);
        if (cellElement !== cfg.element) continue;
      }
      const gained = grantMana(state, unit.owner, cfg.amount);
      if (gained <= 0) continue;
      const entry = {
        type: 'ADJACENT_ALLY_DEATH',
        owner: unit.owner,
        amount: gained,
        source: { tplId: tpl.id, name: tpl.name || tpl.id },
        position: { r: nr, c: nc },
        relatedDeath: { r: death.r, c: death.c, tplId: death.tplId },
      };
      result.entries.push(entry);
      result.total += gained;
      const ownerLabel = unit.owner != null ? `игрок ${unit.owner + 1}` : 'игрок';
      const name = tpl.name || tpl.id || 'Существо';
      result.logs.push(`${name}: ${ownerLabel} получает +${gained} маны за гибель союзника рядом.`);
    }
  }
  return result;
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
      const nativeElement = cfg.element || normalizeElement(tpl.element);
      if (!nativeElement) continue;
      const cellElement = normalizeElement(cell?.element || null);
      if (cellElement === nativeElement) continue;

      const gained = grantMana(state, playerIndex, cfg.amount);
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

export function applyDeathManaEffects(state, deaths = [], context = {}) {
  if (!Array.isArray(deaths) || deaths.length === 0) {
    return { total: 0, entries: [], logs: [] };
  }
  const direct = applyDirectDeathMana(state, deaths);
  const adjacent = applyAdjacentDeathMana(state, deaths);
  const total = (direct.total || 0) + (adjacent.total || 0);
  const entries = [...(direct.entries || []), ...(adjacent.entries || [])];
  const logs = [...(direct.logs || []), ...(adjacent.logs || [])];
  if (context?.collectLogs === false) {
    return { total, entries, logs: [] };
  }
  return { total, entries, logs };
}

export default {
  grantMana,
  normalizeManaGainConfig,
  applyTurnStartManaEffects,
  applyDeathManaEffects,
};
