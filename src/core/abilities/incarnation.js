// Логика способности "инкарнация" — чистая игровая механика без UI
import { CARDS } from '../cards.js';
import { capMana } from '../constants.js';
import { computeCellBuff } from '../fieldEffects.js';
import { ABILITY_KEYS, getAbilityConfig, hasAbility } from '../abilityRegistry.js';

const DEFAULT_CONFIG = {
  sacrificeOwner: 'ALLY',
  costMode: 'DIFF',
  skipAttackOnSummon: true,
};

function resolveConfig(tpl) {
  const cfg = getAbilityConfig(tpl, ABILITY_KEYS.INCARNATION);
  if (!cfg) return null;
  return { ...DEFAULT_CONFIG, ...cfg };
}

function snapshotUnit(unit) {
  if (!unit) return null;
  return {
    uid: unit.uid ?? null,
    tplId: unit.tplId,
    owner: unit.owner,
    currentHP: unit.currentHP ?? null,
  };
}

export function isIncarnationCard(tplOrId) {
  return hasAbility(tplOrId, ABILITY_KEYS.INCARNATION);
}

export function evaluateIncarnationPlacement(state, tpl, playerIndex, r, c) {
  const config = resolveConfig(tpl);
  if (!config) {
    return { allowed: false, reason: 'Инкарнация недоступна.' };
  }
  const cell = state?.board?.[r]?.[c];
  if (!cell?.unit) {
    return { allowed: false, reason: 'Для инкарнации нужна союзная цель.' };
  }
  const unit = cell.unit;
  if (typeof playerIndex === 'number' && unit.owner !== playerIndex) {
    return { allowed: false, reason: 'Можно жертвовать только союзные карты.' };
  }
  const tplSacrifice = CARDS[unit.tplId];
  if (!tplSacrifice) {
    return { allowed: false, reason: 'Неизвестная цель для инкарнации.' };
  }
  const baseCost = Number(tpl?.cost ?? 0);
  const sacrificeCost = Number(tplSacrifice?.cost ?? 0);
  let cost = baseCost;
  if (config.costMode === 'DIFF') {
    cost = Math.max(0, baseCost - sacrificeCost);
  }
  return {
    allowed: true,
    cost,
    config,
    sacrifice: {
      ...snapshotUnit(unit),
      r,
      c,
      tplName: tplSacrifice?.name || null,
      cost: sacrificeCost,
    },
  };
}

export function applyIncarnationSacrifice(state, evaluation) {
  if (!state || !evaluation?.allowed) {
    return { ok: false, reason: 'Инкарнация недоступна.' };
  }
  const info = evaluation.sacrifice;
  if (!info) {
    return { ok: false, reason: 'Нет данных о цели инкарнации.' };
  }
  const cell = state.board?.[info.r]?.[info.c];
  if (!cell?.unit) {
    return { ok: false, reason: 'Цель уже отсутствует.' };
  }
  const unit = cell.unit;
  if (info.uid != null && unit.uid != null && unit.uid !== info.uid) {
    return { ok: false, reason: 'Цель сменилась.' };
  }
  if (info.owner != null && unit.owner !== info.owner) {
    return { ok: false, reason: 'Цель больше не принадлежит игроку.' };
  }
  const tplSacrifice = CARDS[unit.tplId];
  const logs = [];
  const name = tplSacrifice?.name || 'Существо';
  logs.push(`${name} приносится в жертву для инкарнации.`);

  const owner = unit.owner;
  const amount = tplSacrifice?.onDeathAddHPAll;
  const buffs = [];
  if (typeof amount === 'number' && amount !== 0) {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        if (rr === info.r && cc === info.c) continue;
        const cellAlly = state.board?.[rr]?.[cc];
        const ally = cellAlly?.unit;
        if (!ally || ally.owner !== owner) continue;
        const tplAlly = CARDS[ally.tplId];
        if (!tplAlly) continue;
        const cellElement = cellAlly?.element ?? null;
        const fieldBuff = computeCellBuff(cellElement, tplAlly.element);
        const baseHp = (tplAlly.hp ?? 0) + fieldBuff.hp;
        ally.bonusHP = (ally.bonusHP ?? 0) + amount;
        const maxHP = baseHp + ally.bonusHP;
        const before = ally.currentHP ?? baseHp;
        ally.currentHP = Math.min(maxHP, before + amount);
      }
    }
    buffs.push({ owner, amount });
    logs.push(`${name}: союзники усиливаются на +${amount} HP.`);
  }

  cell.unit = null;
  if (state.players?.[owner]) {
    const pl = state.players[owner];
    pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : [];
    const tplRef = CARDS[unit.tplId] || { id: unit.tplId, name };
    pl.graveyard.push(tplRef);
    pl.mana = capMana((pl.mana || 0) + 1);
  }

  return {
    ok: true,
    logs,
    manaGain: { owner, amount: 1 },
    buffs,
    removed: {
      tplId: unit.tplId,
      owner,
      uid: unit.uid ?? null,
    },
  };
}

export function markIncarnationSummon(unit, state, config) {
  if (!unit || !state) return;
  const cfg = config || resolveConfig(CARDS[unit.tplId]);
  if (cfg?.skipAttackOnSummon) {
    unit.lastAttackTurn = state.turn;
  }
}
