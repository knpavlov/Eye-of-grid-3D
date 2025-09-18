// Вспомогательные обработчики для ключевых способностей (инкарнации, особые цели магии)
import { CARDS } from './cards.js';
import { inBounds } from './constants.js';

function toElement(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'object' && value.element) return String(value.element).toUpperCase();
  return null;
}

function ensurePlayer(state, owner) {
  if (!state?.players) return null;
  if (owner == null || owner < 0 || owner >= state.players.length) return null;
  if (!Array.isArray(state.players)) return null;
  const pl = state.players[owner];
  if (!pl) return null;
  if (!Array.isArray(pl.graveyard)) { pl.graveyard = []; }
  return pl;
}

function uniqueCells() {
  const seen = new Set();
  return {
    add(list, r, c) {
      if (!inBounds(r, c)) return;
      const key = `${r},${c}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ r, c });
    },
  };
}

export function isIncarnationUnit(tpl) {
  return !!tpl?.incarnation;
}

export function computeIncarnationCost(tpl, baseTpl) {
  const baseCost = typeof tpl?.cost === 'number' ? tpl.cost : 0;
  const originalCost = typeof baseTpl?.cost === 'number' ? baseTpl.cost : 0;
  const diff = baseCost - originalCost;
  return diff > 0 ? diff : 0;
}

export function evaluateIncarnationSummon(state, tpl, r, c, opts = {}) {
  if (!isIncarnationUnit(tpl)) {
    return { allowed: false, reason: 'NOT_INCARNATION' };
  }
  const playerIndex = typeof opts.playerIndex === 'number' ? opts.playerIndex : state?.active;
  const cell = state?.board?.[r]?.[c];
  if (!cell) {
    return { allowed: false, reason: 'OUT_OF_BOUNDS' };
  }
  const occupant = cell.unit;
  if (!occupant) {
    return { allowed: false, reason: 'NO_UNIT' };
  }
  if (typeof playerIndex === 'number' && occupant.owner !== playerIndex) {
    return { allowed: false, reason: 'NOT_ALLY', occupant };
  }
  const occupantTpl = CARDS[occupant.tplId];
  if (!occupantTpl) {
    return { allowed: false, reason: 'UNKNOWN_TEMPLATE', occupant };
  }
  const cost = computeIncarnationCost(tpl, occupantTpl);
  return {
    allowed: true,
    cost,
    occupant,
    occupantTpl,
  };
}

export function applyIncarnationReplacement(state, r, c, tpl, opts = {}) {
  const expectedUid = opts?.expectedUid;
  const playerIndex = typeof opts.playerIndex === 'number' ? opts.playerIndex : state?.active;
  const evaluation = evaluateIncarnationSummon(state, tpl, r, c, { playerIndex });
  if (!evaluation.allowed) {
    return { success: false, reason: evaluation.reason };
  }
  const { occupant, occupantTpl, cost } = evaluation;
  if (expectedUid != null && occupant?.uid !== expectedUid) {
    return { success: false, reason: 'UNIT_CHANGED' };
  }
  const cell = state?.board?.[r]?.[c];
  if (cell) {
    cell.unit = null;
  }
  const owner = occupant?.owner;
  const player = ensurePlayer(state, owner);
  if (player) {
    player.graveyard.push(occupantTpl || { id: occupant?.tplId, name: occupantTpl?.name || occupant?.tplId });
  }
  return {
    success: true,
    cost,
    sacrificed: {
      owner,
      tplId: occupant?.tplId,
      uid: occupant?.uid,
      name: occupantTpl?.name || occupant?.tplId || 'Существо',
    },
  };
}

export function shouldPreventImmediateAttack(tpl) {
  return isIncarnationUnit(tpl);
}

export function collectKeywordMagicTargets(state, tpl, attacker, opts = {}) {
  const extra = [];
  if (!tpl) return extra;
  const gather = uniqueCells();
  const playerIndex = typeof opts.playerIndex === 'number'
    ? opts.playerIndex
    : (attacker?.owner ?? null);

  const addIfEnemy = (rr, cc) => {
    if (!inBounds(rr, cc)) return;
    const cell = state?.board?.[rr]?.[cc];
    const unit = cell?.unit;
    if (!unit) return;
    if (typeof playerIndex === 'number' && unit.owner === playerIndex) return;
    gather.add(extra, rr, cc);
  };

  const nonElement = toElement(tpl.magicTargetsEnemiesOnNonElement);
  if (nonElement) {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        const cell = state?.board?.[rr]?.[cc];
        if (!cell) continue;
        if (cell.element === nonElement) continue;
        addIfEnemy(rr, cc);
      }
    }
  }

  if (tpl.magicTargetsAllEnemies) {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        addIfEnemy(rr, cc);
      }
    }
  }

  return extra;
}

export default {
  isIncarnationUnit,
  computeIncarnationCost,
  evaluateIncarnationSummon,
  applyIncarnationReplacement,
  shouldPreventImmediateAttack,
  collectKeywordMagicTargets,
};
