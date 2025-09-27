// Перемещение существ после смерти источника (логика без привязки к визуализации)
import { CARDS } from '../cards.js';
import { inBounds } from '../constants.js';
import { applyFieldTransitionToUnit } from '../fieldEffects.js';
import { applyFieldFatalityCheck, describeFieldFatality } from '../abilities.js';

function getCell(state, r, c) {
  if (!state?.board) return null;
  if (!inBounds(r, c)) return null;
  return state.board[r]?.[c] || null;
}

export function applyDeathRepositionEffects(state, deaths = []) {
  const logs = [];
  if (!state || !Array.isArray(deaths) || deaths.length === 0) {
    return { logs };
  }

  for (const death of deaths) {
    if (!death) continue;
    const tplDead = CARDS[death.tplId];
    if (!tplDead?.deathPullFrontToSelf) continue;

    const front = death.front;
    if (!front || !inBounds(front.r, front.c)) continue;

    const destCell = getCell(state, death.r, death.c);
    const srcCell = getCell(state, front.r, front.c);
    if (!destCell || !srcCell) continue;
    if (destCell.unit) continue; // клетка должна быть пустой после смерти

    const unit = srcCell.unit;
    if (!unit) continue;
    if (front.uid != null && unit.uid != null && unit.uid !== front.uid) continue;

    const tplUnit = CARDS[unit.tplId];
    if (!tplUnit) continue;
    const currentHp = unit.currentHP ?? tplUnit.hp ?? 0;
    if (currentHp <= 0) continue;

    const moverName = tplUnit.name || 'Существо';
    const sourceName = tplDead?.name || 'существо';

    srcCell.unit = null;
    destCell.unit = unit;
    logs.push(`${moverName} занимает поле ${sourceName} после её гибели.`);

    const fromElement = srcCell.element || front.element || null;
    const toElement = destCell.element || death.element || null;
    const shift = applyFieldTransitionToUnit(unit, tplUnit, fromElement, toElement);
    if (shift) {
      const fieldLabel = shift.nextElement ? `поле ${shift.nextElement}` : 'нейтральное поле';
      if (shift.deltaHp > 0) {
        logs.push(`${moverName} усиливается, перейдя на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`);
      } else if (shift.deltaHp < 0) {
        logs.push(`${moverName} слабеет на ${fieldLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`);
      }
    }

    const hazard = applyFieldFatalityCheck(unit, tplUnit, toElement);
    const fatalLog = describeFieldFatality(tplUnit, hazard, { name: moverName });
    if (fatalLog) {
      logs.push(fatalLog);
    }
  }

  return { logs };
}

export default { applyDeathRepositionEffects };
