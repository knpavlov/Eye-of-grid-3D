// Перемещения существ, срабатывающие при смерти других юнитов (чистая логика)
import { CARDS } from '../cards.js';
import { DIR_VECTORS, inBounds } from '../constants.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';
import { applyFieldFatalityCheck, describeFieldFatality } from './fieldHazards.js';

function describeShift(shift, name) {
  if (!shift) return null;
  const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральное поле';
  if (shift.deltaHp > 0) {
    return `${name} усиливается на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`;
  }
  if (shift.deltaHp < 0) {
    return `${name} теряет силу на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`;
  }
  return null;
}

export function applyDeathRepositionEffects(state, deaths = []) {
  const logs = [];
  if (!state?.board || !Array.isArray(deaths) || !deaths.length) {
    return { logs };
  }

  for (const death of deaths) {
    if (!death) continue;
    const tpl = CARDS[death.tplId];
    if (!tpl?.deathPullFrontToSelf) continue;

    const facing = typeof death.facing === 'string' ? death.facing : 'N';
    const vec = DIR_VECTORS[facing] || DIR_VECTORS.N;
    const frontR = death.r + vec[0];
    const frontC = death.c + vec[1];
    if (!inBounds(frontR, frontC)) continue;

    const frontCell = state.board?.[frontR]?.[frontC];
    const targetUnit = frontCell?.unit;
    if (!targetUnit) continue;
    const targetTpl = CARDS[targetUnit.tplId];
    if (!targetTpl) continue;
    const targetHp = typeof targetUnit.currentHP === 'number' ? targetUnit.currentHP : targetTpl.hp || 0;
    if (targetHp <= 0) continue;

    const destCell = state.board?.[death.r]?.[death.c];
    if (!destCell || destCell.unit) continue;

    frontCell.unit = null;
    destCell.unit = targetUnit;

    const sourceName = tpl?.name || 'Существо';
    const targetName = targetTpl?.name || 'Существо';
    logs.push(`${sourceName}: ${targetName} перемещается на её прежнее поле.`);

    const fromElement = frontCell?.element || null;
    const toElement = destCell?.element || null;

    const shift = applyFieldTransitionToUnit(targetUnit, targetTpl, fromElement, toElement);
    const shiftLog = describeShift(shift, targetName);
    if (shiftLog) logs.push(shiftLog);

    const hazard = applyFieldFatalityCheck(targetUnit, targetTpl, toElement);
    const fatalLog = describeFieldFatality(targetTpl, hazard, { name: targetName });
    if (fatalLog) logs.push(fatalLog);
  }

  return { logs };
}

export default {
  applyDeathRepositionEffects,
};
