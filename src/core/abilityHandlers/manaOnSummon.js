// Логика генерации маны от аур при призыве существ
// Модуль не содержит визуального кода и может быть переиспользован при миграции на Unity
import { CARDS } from '../cards.js';
import { capMana } from '../constants.js';
import { normalizeElementName } from '../utils/elements.js';

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTrigger(raw) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : null;
  if (value === 'ALLY' || value === 'ALLIED' || value === 'FRIENDLY' || value === 'SELF') {
    return 'ALLY';
  }
  if (value === 'ENEMY' || value === 'OPPONENT' || value === 'FOE') {
    return 'ENEMY';
  }
  if (value === 'ANY' || value === 'BOTH') {
    return 'ANY';
  }
  return 'ALLY';
}

function parseElement(raw) {
  if (!raw) return null;
  return normalizeElementName(raw);
}

function normalizeConfigEntry(raw) {
  if (!raw) return null;
  if (raw === true) {
    return { trigger: 'ALLY', amount: 1, excludeSelfSummon: true, reason: 'SUMMON_AURA' };
  }
  if (typeof raw !== 'object') return null;
  const trigger = normalizeTrigger(raw.trigger || raw.type || raw.mode);
  const amount = Number.isFinite(raw.amount)
    ? Math.floor(raw.amount)
    : Number.isFinite(raw.gain)
      ? Math.floor(raw.gain)
      : 1;
  const entry = {
    trigger,
    amount: Math.max(0, amount),
    excludeSelfSummon: raw.excludeSelfSummon === true || raw.excludeSelf === true,
    reason: typeof raw.reason === 'string' ? raw.reason.trim().toUpperCase() : null,
    log: typeof raw.log === 'string' ? raw.log : null,
    sourceFieldElement: parseElement(raw.sourceFieldElement || raw.sourceElement || raw.sourceOnElement),
    sourceFieldNotElement: parseElement(raw.sourceFieldNotElement || raw.sourceFieldNot || raw.sourceNotElement),
    summonFieldElement: parseElement(raw.summonFieldElement || raw.targetFieldElement || raw.summonElement),
    summonFieldNotElement: parseElement(raw.summonFieldNotElement || raw.summonFieldNot || raw.summonNotElement),
    requireSummonedElement: parseElement(raw.requireSummonedElement || raw.summonedElement || raw.unitElement),
  };
  return entry;
}

function normalizeConfigs(raw) {
  const res = [];
  for (const item of toArray(raw)) {
    const cfg = normalizeConfigEntry(item);
    if (cfg && cfg.amount > 0) {
      res.push(cfg);
    }
  }
  return res;
}

function formatLog(template, data) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lower = key.toLowerCase();
    if (lower === 'amount') return String(data.amount ?? '');
    if (lower === 'name') return data.name ?? '';
    if (lower === 'player') return data.player ?? '';
    return match;
  });
}

function shouldTrigger(cfg, ctx) {
  const { sourceOwner, summonOwner, sourcePos, summonPos, sourceElement, summonFieldElement, summonedElement } = ctx;
  if (cfg.trigger === 'ALLY' && (sourceOwner == null || sourceOwner !== summonOwner)) {
    return false;
  }
  if (cfg.trigger === 'ENEMY' && (sourceOwner == null || summonOwner == null || sourceOwner === summonOwner)) {
    return false;
  }
  if (cfg.excludeSelfSummon && sourcePos && summonPos && sourcePos.r === summonPos.r && sourcePos.c === summonPos.c) {
    return false;
  }
  if (cfg.sourceFieldElement && sourceElement !== cfg.sourceFieldElement) {
    return false;
  }
  if (cfg.sourceFieldNotElement && sourceElement === cfg.sourceFieldNotElement) {
    return false;
  }
  if (cfg.summonFieldElement && summonFieldElement !== cfg.summonFieldElement) {
    return false;
  }
  if (cfg.summonFieldNotElement && summonFieldElement === cfg.summonFieldNotElement) {
    return false;
  }
  if (cfg.requireSummonedElement && summonedElement !== cfg.requireSummonedElement) {
    return false;
  }
  return true;
}

export function applyManaGainOnSummon(state, context = {}) {
  const events = [];
  if (!state?.board || !Array.isArray(state.players)) return events;
  const summonOwner = context.unit?.owner ?? context.owner ?? null;
  const summonPos = { r: context.r ?? null, c: context.c ?? null };
  const summonFieldElement = parseElement(
    context.cell?.element ?? (typeof context.fieldElement === 'string' ? context.fieldElement : null)
  );
  const summonedTpl = context.tpl || (context.unit ? CARDS[context.unit.tplId] : null);
  const summonedElement = parseElement(summonedTpl?.element);

  for (let r = 0; r < state.board.length; r += 1) {
    const row = state.board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl?.manaOnSummon) continue;
      const configs = normalizeConfigs(tpl.manaOnSummon);
      if (!configs.length) continue;
      const sourceOwner = unit.owner;
      const sourceElement = parseElement(cell?.element);
      for (const cfg of configs) {
        if (!shouldTrigger(cfg, { sourceOwner, summonOwner, sourcePos: { r, c }, summonPos, sourceElement, summonFieldElement, summonedElement })) {
          continue;
        }
        const player = state.players[sourceOwner];
        if (!player) continue;
        const before = typeof player.mana === 'number' ? player.mana : 0;
        const after = capMana(before + cfg.amount);
        const gained = after - before;
        if (gained <= 0) continue;
        player.mana = after;
        const entry = {
          owner: sourceOwner,
          before,
          after,
          amount: gained,
          r,
          c,
          tplId: tpl.id,
          tplName: tpl.name || tpl.id || 'Существо',
          fieldElement: sourceElement,
          reason: cfg.reason || 'SUMMON_AURA',
          log: formatLog(cfg.log, {
            amount: gained,
            name: tpl.name || tpl.id || 'Существо',
            player: (sourceOwner ?? 0) + 1,
          }),
        };
        entry.source = entry.reason;
        events.push(entry);
      }
    }
  }
  return events;
}

export default { applyManaGainOnSummon };
