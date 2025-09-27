// Эффекты перемещения, срабатывающие при гибели существ
// Чистая логика без зависимостей от визуального слоя
import { CARDS } from '../cards.js';
import { inBounds } from '../constants.js';
import { applyFieldFatalityCheck, describeFieldFatality } from './fieldHazards.js';
import { buildDeathRecord } from '../utils/deaths.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizePullFrontConfig(raw) {
  if (!raw) return null;
  const base = {
    requireAlive: true,
    requireUid: true,
    preventIfOccupied: true,
    log: true,
  };
  if (raw === true) return { ...base };
  if (typeof raw === 'object') {
    const cfg = { ...base };
    if (raw.requireAlive === false) cfg.requireAlive = false;
    if (raw.requireUid === false) cfg.requireUid = false;
    if (raw.preventIfOccupied === false) cfg.preventIfOccupied = false;
    if (raw.log === false) cfg.log = false;
    return cfg;
  }
  return { ...base };
}

function collectPullFrontConfigs(tpl) {
  if (!tpl) return [];
  const entries = [];
  for (const raw of toArray(tpl.deathPullFront)) {
    const cfg = normalizePullFrontConfig(raw);
    if (cfg) entries.push(cfg);
  }
  return entries;
}

export function applyDeathRepositionEffects(state, deaths = [], context = {}) {
  const result = { moves: [], logs: [] };
  if (!state?.board || !Array.isArray(deaths) || deaths.length === 0) {
    return result;
  }

  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    const configs = collectPullFrontConfigs(tpl);
    if (!configs.length) continue;
    const front = death.front;
    if (!front) continue;
    const destR = death.r;
    const destC = death.c;
    if (!inBounds(destR, destC)) continue;
    const destCell = state.board?.[destR]?.[destC];
    if (!destCell) continue;

    for (const cfg of configs) {
      const frontR = front.r;
      const frontC = front.c;
      if (!inBounds(frontR, frontC)) continue;
      const frontCell = state.board?.[frontR]?.[frontC];
      if (!frontCell) continue;
      const unit = frontCell.unit;
      if (!unit) continue;
      if (cfg.requireUid && front.uid != null && unit.uid != null && unit.uid !== front.uid) {
        continue;
      }
      const tplFront = CARDS[unit.tplId];
      if (!tplFront) continue;
      const baseHp = tplFront.hp ?? 0;
      const alive = (unit.currentHP ?? baseHp) > 0;
      if (cfg.requireAlive && !alive) continue;
      if (cfg.preventIfOccupied && destCell.unit) continue;

      destCell.unit = unit;
      frontCell.unit = null;
      result.moves.push({
        unit: { uid: unit.uid ?? null, tplId: unit.tplId, owner: unit.owner ?? null },
        from: { r: frontR, c: frontC },
        to: { r: destR, c: destC },
        source: { tplId: tpl?.id ?? death.tplId, owner: death.owner ?? null },
        context: context?.cause || 'DEATH',
      });
      if (cfg.log) {
        const name = tpl?.name || tpl?.id || 'Существо';
        result.logs.push(`${name}: существо перед ним перемещается на освободившееся поле.`);
      }

      const destElement = destCell.element || null;
      const hazard = applyFieldFatalityCheck(unit, tplFront, destElement);
      if (hazard?.dies) {
        const fatalLog = describeFieldFatality(tplFront, hazard, { name: tplFront?.name || tplFront?.id || 'Существо' });
        if (fatalLog) {
          result.logs.push(fatalLog);
        }
        const followup = buildDeathRecord(state, destR, destC, unit);
        if (followup) {
          deaths.push(followup);
        }
        destCell.unit = null;
      }
      break;
    }
  }

  return result;
}

export default applyDeathRepositionEffects;
