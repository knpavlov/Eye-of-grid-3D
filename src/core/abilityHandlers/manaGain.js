// Логика начисления дополнительной маны за различные условия смерти существ
// Только чистая игровая логика без визуальных зависимостей
import { CARDS } from '../cards.js';
import { capMana } from '../constants.js';
import { normalizeElementName } from '../utils/elements.js';

function getTemplate(unitOrId) {
  if (!unitOrId) return null;
  if (typeof unitOrId === 'string') {
    return CARDS[unitOrId] || null;
  }
  if (unitOrId.tplId && CARDS[unitOrId.tplId]) {
    return CARDS[unitOrId.tplId];
  }
  if (unitOrId.id && CARDS[unitOrId.id]) {
    return CARDS[unitOrId.id];
  }
  return null;
}

function safePlayer(state, index) {
  if (!state || !Array.isArray(state.players)) return null;
  if (typeof index !== 'number' || index < 0 || index >= state.players.length) return null;
  return state.players[index] || null;
}

function hardManaCap(player) {
  const declared = typeof player?.maxMana === 'number' ? player.maxMana : 10;
  return Math.min(10, Math.max(0, declared));
}

function countEnemyUnits(state, owner) {
  if (!state?.board) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const unit = row[c]?.unit;
      if (!unit) continue;
      if (typeof owner === 'number' && unit.owner === owner) continue;
      const tpl = getTemplate(unit);
      if (!tpl) continue;
      if ((unit.currentHP ?? tpl.hp ?? 0) <= 0) continue;
      total += 1;
    }
  }
  return total;
}

function countFieldsByElement(state, element) {
  if (!state?.board || !element) return 0;
  const normalized = normalizeElementName(element);
  if (!normalized) return 0;
  let total = 0;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const el = normalizeElementName(row[c]?.element);
      if (el === normalized) total += 1;
    }
  }
  return total;
}

function parseDeathConfigString(raw) {
  if (!raw) return null;
  const token = String(raw).trim().toUpperCase();
  if (!token) return null;
  if (token === 'ENEMY_COUNT' || token === 'ENEMIES' || token === 'ENEMIES_ON_BOARD') {
    return { type: 'ENEMY_UNITS', amountPer: 1 };
  }
  const fieldMatch = token.match(/^([A-Z]+)_FIELDS$/);
  if (fieldMatch) {
    const element = normalizeElementName(fieldMatch[1]);
    if (element) return { type: 'FIELD_ELEMENT', element, amountPer: 1 };
  }
  const altFieldMatch = token.match(/^FIELDS_([A-Z]+)$/);
  if (altFieldMatch) {
    const element = normalizeElementName(altFieldMatch[1]);
    if (element) return { type: 'FIELD_ELEMENT', element, amountPer: 1 };
  }
  const element = normalizeElementName(token);
  if (element) {
    return { type: 'FIELD_ELEMENT', element, amountPer: 1 };
  }
  return null;
}

function normalizeDeathManaGainConfig(raw, tpl) {
  if (!raw) return null;
  if (raw === true) {
    return { type: 'STATIC', amount: 1 };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { type: 'STATIC', amount };
  }
  if (typeof raw === 'string') {
    const parsed = parseDeathConfigString(raw);
    if (parsed) return parsed;
    return null;
  }
  if (typeof raw === 'object') {
    if (raw.amount != null && (raw.type == null)) {
      const amount = Math.max(0, Math.floor(Number(raw.amount)));
      if (amount <= 0) return null;
      return { type: 'STATIC', amount };
    }
    const typeRaw = raw.type || raw.mode || raw.kind || raw.source || null;
    const type = typeof typeRaw === 'string' ? typeRaw.trim().toUpperCase() : null;
    if (type === 'STATIC' || type === 'FLAT' || type === 'FIXED') {
      const amount = Math.max(0, Math.floor(Number(raw.amount ?? raw.value ?? raw.plus ?? 1)));
      if (amount <= 0) return null;
      return { type: 'STATIC', amount };
    }
    if (type === 'ENEMY_UNITS' || type === 'ENEMIES' || type === 'ENEMY_COUNT') {
      const per = Number.isFinite(raw.amountPer) ? raw.amountPer : (raw.per ?? raw.amount ?? 1);
      const amountPer = Math.max(0, Math.floor(Number(per) || 0));
      if (amountPer <= 0) return null;
      return { type: 'ENEMY_UNITS', amountPer };
    }
    if (type === 'FIELD_ELEMENT' || type === 'FIELD_COUNT' || raw.element != null) {
      const elementRaw = raw.element ?? raw.elementType ?? raw.field ?? raw.fieldElement ?? (type ? null : tpl?.element);
      const element = normalizeElementName(elementRaw);
      if (!element) return null;
      const per = Number.isFinite(raw.amountPer) ? raw.amountPer : (raw.per ?? raw.amount ?? raw.plus ?? 1);
      const amountPer = Math.max(0, Math.floor(Number(per) || 0));
      if (amountPer <= 0) return null;
      return { type: 'FIELD_ELEMENT', element, amountPer };
    }
    const fallback = parseDeathConfigString(typeRaw || raw.reference || raw.rule);
    if (fallback) return fallback;
  }
  return null;
}

function resolveDeathManaAmount(state, death, cfg) {
  if (!cfg) return 0;
  if (cfg.type === 'STATIC') {
    return Math.max(0, Math.floor(cfg.amount || 0));
  }
  if (cfg.type === 'ENEMY_UNITS') {
    const count = countEnemyUnits(state, death?.owner);
    const per = Math.max(0, Math.floor(cfg.amountPer || 0));
    return count * per;
  }
  if (cfg.type === 'FIELD_ELEMENT') {
    const count = countFieldsByElement(state, cfg.element);
    const per = Math.max(0, Math.floor(cfg.amountPer || 0));
    return count * per;
  }
  return 0;
}

function applyManaGain(player, amount) {
  if (!player) return { gained: 0, before: 0, after: 0 };
  const before = typeof player.mana === 'number' ? player.mana : 0;
  if (amount <= 0) {
    return { gained: 0, before, after: before };
  }
  const limit = hardManaCap(player);
  const rawAfter = before + amount;
  const cappedAfter = Math.min(limit, capMana(rawAfter));
  player.mana = cappedAfter;
  return { gained: cappedAfter - before, before, after: cappedAfter };
}

function cloneEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}

export function applyDeathManaGain(state, deaths = [], context = {}) {
  const result = { total: 0, entries: [] };
  if (!state || !Array.isArray(deaths) || !deaths.length) return result;
  for (const death of deaths) {
    if (!death) continue;
    const owner = death.owner;
    const player = safePlayer(state, owner);
    if (!player) continue;
    const tpl = getTemplate(death.tplId);
    const cfgRaw = tpl?.onDeathManaGain;
    const cfg = normalizeDeathManaGainConfig(cfgRaw, tpl);
    if (!cfg) continue;
    const amount = resolveDeathManaAmount(state, death, cfg);
    if (amount <= 0) continue;
    const applied = applyManaGain(player, amount);
    if (applied.gained <= 0) continue;
    result.total += applied.gained;
    result.entries.push({
      playerIndex: owner,
      amount: applied.gained,
      before: applied.before,
      after: applied.after,
      source: {
        tplId: tpl?.id || death.tplId || null,
        name: tpl?.name || null,
        r: death.r ?? null,
        c: death.c ?? null,
      },
      mode: cfg.type,
      count: cfg.type === 'STATIC' ? null : (cfg.type === 'ENEMY_UNITS'
        ? countEnemyUnits(state, owner)
        : (cfg.type === 'FIELD_ELEMENT' ? countFieldsByElement(state, cfg.element) : null)),
      element: cfg.element || null,
      cause: context.cause || null,
    });
  }
  return result;
}

function normalizeAdjacentDeathManaConfig(raw) {
  if (!raw) return null;
  if (raw === true) {
    return { amount: 1, alliedOnly: true, requireField: null };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { amount, alliedOnly: true, requireField: null };
  }
  if (typeof raw === 'string') {
    const token = raw.trim();
    if (!token) return null;
    const element = normalizeElementName(token.replace(/_FIELD$/i, ''));
    return { amount: 1, alliedOnly: true, requireField: element || null };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.plus ?? raw.gain ?? raw.value ?? 1;
    const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
    if (amount <= 0) return null;
    const alliedOnly = raw.alliedOnly !== false && raw.target === 'ALLY' ? true : raw.alliedOnly !== false;
    const fieldToken = raw.requireField ?? raw.field ?? raw.onField ?? raw.element ?? raw.elementType ?? null;
    const requireField = normalizeElementName(fieldToken);
    return { amount, alliedOnly: alliedOnly !== false, requireField: requireField || null };
  }
  return null;
}

function isUnitAlive(unit, tpl) {
  if (!unit) return false;
  const hp = typeof unit.currentHP === 'number' ? unit.currentHP : tpl?.hp ?? 0;
  return hp > 0;
}

export function applyAdjacentDeathManaGain(state, deaths = [], context = {}) {
  const result = { total: 0, entries: [] };
  if (!state?.board || !Array.isArray(deaths) || !deaths.length) return result;
  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const unit = row[c]?.unit;
      if (!unit) continue;
      const tpl = getTemplate(unit);
      if (!tpl) continue;
      if (!isUnitAlive(unit, tpl)) continue;
      const cfg = normalizeAdjacentDeathManaConfig(tpl.adjacentDeathManaGain);
      if (!cfg) continue;
      if (cfg.requireField) {
        const cellElement = normalizeElementName(row[c]?.element);
        if (cellElement !== cfg.requireField) continue;
      }
      let count = 0;
      for (const death of deaths) {
        if (!death) continue;
        if (cfg.alliedOnly && death.owner !== unit.owner) continue;
        if (typeof death.r !== 'number' || typeof death.c !== 'number') continue;
        const dr = Math.abs(death.r - r);
        const dc = Math.abs(death.c - c);
        if (dr + dc !== 1) continue;
        count += 1;
      }
      if (count <= 0) continue;
      const player = safePlayer(state, unit.owner);
      if (!player) continue;
      const applied = applyManaGain(player, cfg.amount * count);
      if (applied.gained <= 0) continue;
      result.total += applied.gained;
      result.entries.push({
        playerIndex: unit.owner,
        amount: applied.gained,
        before: applied.before,
        after: applied.after,
        source: {
          tplId: tpl.id,
          name: tpl.name || null,
          r,
          c,
        },
        count,
        mode: 'ADJACENT',
        element: cfg.requireField || null,
        cause: context.cause || null,
      });
    }
  }
  return result;
}

export function mergeManaGainResults(...results) {
  const merged = { total: 0, entries: [] };
  for (const res of results) {
    if (!res || !Array.isArray(res.entries) || !res.entries.length) continue;
    merged.total += res.total || 0;
    for (const entry of res.entries) {
      merged.entries.push(cloneEntry(entry));
    }
  }
  return merged.entries.length ? merged : null;
}

export default { applyDeathManaGain, applyAdjacentDeathManaGain, mergeManaGainResults };
