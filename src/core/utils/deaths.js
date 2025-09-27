// Утилиты для формирования записей о погибших существах (чистая логика)
import { normalizeElementName } from './elements.js';

export function buildDeathRecord(state, r, c, unit) {
  if (!state || typeof r !== 'number' || typeof c !== 'number' || !unit) {
    return null;
  }
  const tplId = unit.tplId || null;
  const owner = unit.owner != null ? unit.owner : null;
  const uid = unit.uid != null ? unit.uid : null;
  const cellElementRaw = state.board?.[r]?.[c]?.element ?? null;
  const element = normalizeElementName(cellElementRaw) || null;
  return {
    r,
    c,
    owner,
    tplId,
    uid,
    element,
  };
}

export default {
  buildDeathRecord,
};
