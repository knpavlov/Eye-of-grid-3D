// Модуль обработки баффов при призыве (чистая логика без завязки на визуал)
// Поддерживает случайные улучшения характеристик существ

import { computeCellBuff } from '../fieldEffects.js';

function normalizeRandomBuff(raw) {
  if (!raw) return null;
  const cfg = {};
  if (typeof raw === 'number') {
    cfg.hp = Math.max(0, Math.trunc(raw));
  } else if (typeof raw === 'object') {
    if (raw.hp != null && Number.isFinite(Number(raw.hp))) {
      cfg.hp = Math.max(0, Math.trunc(Number(raw.hp)));
    }
    if (raw.atk != null && Number.isFinite(Number(raw.atk))) {
      cfg.atk = Number(raw.atk);
    }
    if (raw.attack != null && Number.isFinite(Number(raw.attack))) {
      cfg.atk = Number(raw.attack);
    }
    if (raw.plusAtk != null && Number.isFinite(Number(raw.plusAtk))) {
      cfg.atk = Number(raw.plusAtk);
    }
    if (raw.chance != null && Number.isFinite(Number(raw.chance))) {
      cfg.chance = Math.max(0, Math.min(1, Number(raw.chance)));
    } else if (raw.probability != null && Number.isFinite(Number(raw.probability))) {
      cfg.chance = Math.max(0, Math.min(1, Number(raw.probability)));
    } else if (raw.rate != null && Number.isFinite(Number(raw.rate))) {
      cfg.chance = Math.max(0, Math.min(1, Number(raw.rate)));
    }
  } else {
    return null;
  }
  if (cfg.hp == null && cfg.atk == null) return null;
  if (cfg.chance == null) cfg.chance = 0.5;
  return cfg;
}

export function applySummonRandomBuff(state, context = {}) {
  const { r, c, unit, tpl } = context;
  if (!unit || !tpl || !tpl.randomSummonBuff) return null;
  const cfg = normalizeRandomBuff(tpl.randomSummonBuff);
  if (!cfg) return null;
  const rng = typeof context.rng === 'function' ? context.rng : Math.random;
  const roll = rng();
  const success = roll < cfg.chance;
  const cell = context.cell || state?.board?.[r]?.[c] || null;
  const cellElement = cell?.element ?? null;
  const buff = computeCellBuff(cellElement, tpl.element);
  const result = {
    type: 'RANDOM_SUMMON_BUFF',
    chance: cfg.chance,
    roll,
    success,
    tplId: tpl.id,
    position: { r, c },
  };
  if (!success) {
    return result;
  }

  if (cfg.hp) {
    unit.bonusHP = (unit.bonusHP || 0) + cfg.hp;
    const baseMax = (tpl.hp || 0) + buff.hp + (unit.bonusHP || 0);
    const beforeHp = typeof unit.currentHP === 'number' ? unit.currentHP : ((tpl.hp || 0) + buff.hp);
    const delta = Math.max(0, Math.min(cfg.hp, baseMax - beforeHp));
    if (delta > 0) {
      unit.currentHP = beforeHp + delta;
    }
    result.hpBonus = cfg.hp;
    result.hpApplied = delta;
  }

  if (cfg.atk) {
    unit.permanentAtkBonus = (unit.permanentAtkBonus || 0) + cfg.atk;
    result.atkBonus = cfg.atk;
  }

  return result;
}

export default { applySummonRandomBuff };
