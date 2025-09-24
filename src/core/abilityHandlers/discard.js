// Модуль обработки эффектов, принуждающих к сбросу карт
// Содержит общую логику для триггеров "discard", чтобы переиспользовать её
// в различных способностях карт и сценариях смерти существ.

import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const DEFAULT_TIMER = 20; // секунд

function normalizeFieldElement(value) {
  const el = normalizeElementName(value);
  return el || null;
}

function countFieldsByElement(state, element) {
  if (!state?.board) return 0;
  const target = normalizeFieldElement(element);
  if (!target) return 0;
  let count = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const el = normalizeFieldElement(state.board?.[r]?.[c]?.element);
      if (el === target) count += 1;
    }
  }
  return count;
}

function resolveTargetPlayer(trigger, owner) {
  const raw = trigger?.target || 'OPPONENT';
  if (raw === 'SELF') return owner;
  if (raw === 'OPPONENT') {
    if (typeof owner !== 'number') return null;
    return owner === 0 ? 1 : 0;
  }
  if (raw === 'PLAYER0' || raw === 'PLAYER_0' || raw === 'PLAYER1') return 0;
  if (raw === 'PLAYER2' || raw === 'PLAYER_1' || raw === 'PLAYER_2') return 1;
  return null;
}

function checkFieldCondition(actualElement, cfg) {
  if (!cfg) return true;
  const expected = normalizeFieldElement(cfg.fieldElement || cfg.element || cfg.field);
  if (!expected) return true;
  const negate = !!(cfg.fieldNot || cfg.not || cfg.negate);
  const actual = normalizeFieldElement(actualElement);
  if (negate) return actual !== expected;
  return actual === expected;
}

function checkWhileOnCondition(entry, trigger) {
  if (!trigger?.whileOn) return true;
  const expected = normalizeFieldElement(trigger.whileOn.element || trigger.whileOn.field);
  if (!expected) return true;
  const negate = !!(trigger.whileOn.fieldNot || trigger.whileOn.not || trigger.whileOn.negate);
  const actual = normalizeFieldElement(entry.fieldElement);
  if (negate) return actual !== expected;
  return actual === expected;
}

function computeAmount(state, amountCfg, context) {
  if (typeof amountCfg === 'number') return Math.max(0, Math.floor(amountCfg));
  if (!amountCfg) return 1;
  if (typeof amountCfg.value === 'number') return Math.max(0, Math.floor(amountCfg.value));
  if (amountCfg.type === 'FIELDS') {
    const element = amountCfg.element || amountCfg.field || amountCfg.of;
    return countFieldsByElement(state, element);
  }
  if (amountCfg.type === 'PER_DEATH') {
    const base = typeof amountCfg.value === 'number' ? amountCfg.value : 1;
    const count = Math.max(0, Math.floor(context?.count ?? 1));
    return Math.max(0, Math.floor(base)) * count;
  }
  return 0;
}

function formatCardCount(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} карт`;
  if (last === 1) return `${n} карту`;
  if (last >= 2 && last <= 4) return `${n} карты`;
  return `${n} карт`;
}

function playerLabel(idx) {
  if (typeof idx !== 'number') return 'игрок ?';
  return `игрок ${idx + 1}`;
}

function normalizeTriggers(tpl) {
  const list = Array.isArray(tpl?.discardTriggers) ? tpl.discardTriggers : [];
  return list.filter(Boolean).map(raw => ({ ...raw, when: raw.when || 'SELF_DEATH' }));
}

function collectSelfDeathTriggers({ beforeState, afterState, deaths }) {
  const after = afterState || beforeState;
  const result = { requests: [], logLines: [] };
  for (const death of deaths) {
    const tpl = CARDS[death.tplId];
    if (!tpl) continue;
    const triggers = normalizeTriggers(tpl).filter(t => t.when === 'SELF_DEATH');
    if (!triggers.length) continue;
    const fieldElement = after?.board?.[death.r]?.[death.c]?.element;
    for (const trigger of triggers) {
      if (!checkFieldCondition(fieldElement, trigger)) continue;
      const targetPlayer = resolveTargetPlayer(trigger, death.owner);
      if (targetPlayer == null) continue;
      const amount = computeAmount(after, trigger.amount, { death, count: 1 });
      if (amount <= 0) continue;
      const timer = typeof trigger.timer === 'number' ? Math.max(1, Math.floor(trigger.timer)) : DEFAULT_TIMER;
      result.requests.push({
        player: targetPlayer,
        amount,
        timer,
        trigger: trigger.when,
        source: {
          tplId: tpl.id,
          name: tpl.name,
          owner: death.owner,
          position: { r: death.r, c: death.c },
        },
      });
      const labelTarget = playerLabel(targetPlayer);
      result.logLines.push(`${tpl.name}: ${labelTarget} сбрасывает ${formatCardCount(amount)}.`);
    }
  }
  return result;
}

function collectAllyDeathTriggers({ beforeState, afterState, deaths }) {
  const before = beforeState || afterState;
  const after = afterState || beforeState;
  const result = { requests: [], logLines: [] };
  if (!before?.board) return result;

  const deathsByOwner = new Map();
  for (const d of deaths) {
    if (typeof d.owner !== 'number') continue;
    if (!deathsByOwner.has(d.owner)) deathsByOwner.set(d.owner, []);
    deathsByOwner.get(d.owner).push(d);
  }

  const sources = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = before.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;
      const triggers = normalizeTriggers(tpl).filter(t => t.when === 'ALLY_DEATH');
      if (!triggers.length) continue;
      const fieldElement = cell?.element;
      const wasDestroyed = deaths.some(d => (d.uid != null && d.uid === unit.uid)
        || (d.tplId === unit.tplId && d.owner === unit.owner && d.r === r && d.c === c));
      sources.push({
        unit,
        tpl,
        triggers,
        fieldElement,
        position: { r, c },
        wasDestroyed,
      });
    }
  }

  for (const source of sources) {
    const owner = source.unit.owner;
    const tpl = source.tpl;
    const relevantDeaths = deathsByOwner.get(owner) || [];
    if (!relevantDeaths.length) continue;
    for (const trigger of source.triggers) {
      if (!checkWhileOnCondition(source, trigger)) continue;
      const includeSelf = trigger.includeSelf !== false;
      let total = 0;
      for (const death of relevantDeaths) {
        if (!includeSelf) {
          const same = (death.uid != null && death.uid === source.unit.uid)
            || (death.tplId === source.unit.tplId && death.owner === source.unit.owner
              && death.r === source.position.r && death.c === source.position.c);
          if (same) continue;
        }
        if (trigger.deathFieldCondition && !checkFieldCondition(after?.board?.[death.r]?.[death.c]?.element, trigger.deathFieldCondition)) {
          continue;
        }
        const amount = computeAmount(after, trigger.amount, { death, count: 1 });
        if (amount > 0) total += amount;
      }
      if (total <= 0) continue;
      const targetPlayer = resolveTargetPlayer(trigger, owner);
      if (targetPlayer == null) continue;
      const timer = typeof trigger.timer === 'number' ? Math.max(1, Math.floor(trigger.timer)) : DEFAULT_TIMER;
      result.requests.push({
        player: targetPlayer,
        amount: total,
        timer,
        trigger: trigger.when,
        source: {
          tplId: tpl.id,
          name: tpl.name,
          owner,
          position: source.position,
        },
      });
      const labelTarget = playerLabel(targetPlayer);
      result.logLines.push(`${tpl.name}: ${labelTarget} сбрасывает ${formatCardCount(total)}.`);
    }
  }
  return result;
}

/**
 * Собирает все discard-триггеры, сработавшие в результате смерти существ.
 * Возвращает объект с логами и запросами на сброс карт.
 */
export function evaluateDiscardTriggers({ beforeState, afterState, deaths }) {
  const result = { requests: [], logLines: [] };
  if (!Array.isArray(deaths) || !deaths.length) return result;

  const self = collectSelfDeathTriggers({ beforeState, afterState, deaths });
  if (self.requests.length) result.requests.push(...self.requests);
  if (self.logLines.length) result.logLines.push(...self.logLines);

  const ally = collectAllyDeathTriggers({ beforeState, afterState, deaths });
  if (ally.requests.length) result.requests.push(...ally.requests);
  if (ally.logLines.length) result.logLines.push(...ally.logLines);

  return result;
}

export { countFieldsByElement, formatCardCount };
