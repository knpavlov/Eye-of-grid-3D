// Модуль обработки мгновенных смертей от неподходящих полей
// Содержит только игровую логику без привязки к визуальной части
import { normalizeElementName } from '../utils/elements.js';

function resolveRequiredElement(tpl) {
  if (!tpl) return null;
  const direct = tpl.diesOffNonElement != null ? tpl.diesOffNonElement : tpl.diesOffElement;
  const normalized = normalizeElementName(direct);
  return normalized || null;
}

function resolveForbiddenElement(tpl) {
  if (!tpl) return null;
  const normalized = normalizeElementName(tpl.diesOnElement);
  return normalized || null;
}

export function evaluateFieldFatality(tpl, cellElement) {
  const cell = normalizeElementName(cellElement);
  const required = resolveRequiredElement(tpl);
  if (required && cell !== required) {
    return { dies: true, reason: 'OFF_ELEMENT', element: required };
  }
  const forbidden = resolveForbiddenElement(tpl);
  if (forbidden && cell === forbidden) {
    return { dies: true, reason: 'ON_ELEMENT', element: forbidden };
  }
  return { dies: false, reason: null, element: null };
}

export function applyFieldFatalityCheck(unit, tpl, cellElement) {
  const verdict = evaluateFieldFatality(tpl, cellElement);
  if (verdict.dies && unit) {
    unit.currentHP = 0;
  }
  return verdict;
}

export function describeFieldFatality(tpl, verdict, opts = {}) {
  if (!verdict?.dies) return null;
  const name = opts.name || tpl?.name || 'Существо';
  const element = verdict.element || 'UNKNOWN';
  if (verdict.reason === 'OFF_ELEMENT') {
    return `${name} погибает вдали от стихии ${element}!`;
  }
  if (verdict.reason === 'ON_ELEMENT') {
    return `${name} не переносит стихию ${element} и погибает!`;
  }
  return `${name} погибает из-за несовместимого поля ${element}.`;
}

export default {
  evaluateFieldFatality,
  applyFieldFatalityCheck,
  describeFieldFatality,
};
