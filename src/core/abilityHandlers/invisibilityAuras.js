// Источники инвизибилити от аур и условий на поле
// Модуль отделён от визуализации для повторного использования
import { CARDS } from '../cards.js';
import { normalizeElement, elementsEqual } from '../utils/elements.js';

const BOARD_SIZE = 3;

function normalizeGrantConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: normalizeElement(raw), includeSelf: true };
  }
  if (typeof raw === 'object') {
    const element = normalizeElement(raw.element || raw.field || raw.type);
    const includeSelf = raw.includeSelf !== false;
    if (!element) return null;
    return { element, includeSelf };
  }
  return null;
}

export function hasInvisibilityFromAuras(state, targetR, targetC, opts = {}) {
  if (!state?.board) return false;
  const cell = state.board?.[targetR]?.[targetC];
  const unit = opts.unit || cell?.unit;
  if (!unit) return false;
  const tplTarget = opts.tpl || CARDS[unit.tplId];
  if (!tplTarget) return false;
  const owner = unit.owner;
  const fieldElement = normalizeElement(cell?.element);
  const tplElement = normalizeElement(tplTarget.element);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const sourceCell = state.board?.[r]?.[c];
      const sourceUnit = sourceCell?.unit;
      if (!sourceUnit || sourceUnit.owner !== owner) continue;
      const tpl = CARDS[sourceUnit.tplId];
      if (!tpl) continue;

      const grantCfg = normalizeGrantConfig(tpl.grantInvisibilityToAlliesOnElement);
      if (grantCfg && grantCfg.element) {
        const sameCell = r === targetR && c === targetC;
        if (!grantCfg.includeSelf && sameCell) {
          // источник не влияет сам на себя
        } else if (elementsEqual(fieldElement, grantCfg.element)) {
          return true;
        }
      }

      if (tpl.invisibilityAuraSameElement) {
        const auraField = normalizeElement(sourceCell?.element);
        if (!auraField || !tplElement) continue;
        if (elementsEqual(auraField, tplElement)) {
          return true;
        }
      }
    }
  }

  return false;
}
