// Обработка пассивных способностей, дающих ману при призыве существ
// Логика полностью отделена от визуального слоя
import { CARDS } from '../cards.js';
import { normalizeElementName } from '../utils/elements.js';

const BOARD_SIZE = 3;
const capMana = (value) => Math.min(10, value);

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeSummonOwner(raw) {
  if (!raw) return 'ALLY';
  const token = String(raw).toUpperCase();
  if (token === 'ALLY' || token === 'FRIEND' || token === 'OWN') return 'ALLY';
  if (token === 'ENEMY' || token === 'OPPONENT') return 'ENEMY';
  if (token === 'ANY' || token === 'BOTH') return 'ANY';
  return 'ALLY';
}

function normalizeManaConfigEntry(raw) {
  if (!raw) return null;
  if (raw === true) {
    return { amount: 1, summonOwner: 'ALLY' };
  }
  if (typeof raw === 'number') {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) return null;
    return { amount, summonOwner: 'ALLY' };
  }
  if (typeof raw === 'object') {
    const amountRaw = raw.amount ?? raw.gain ?? raw.value ?? 1;
    const amount = Math.max(0, Math.floor(Number(amountRaw)) || 0);
    if (amount <= 0) return null;
    const summonOwner = normalizeSummonOwner(raw.summonOwner || raw.trigger || raw.when || raw.owner);
    const requireSummonFieldElement = normalizeElementName(raw.requireSummonFieldElement || raw.summonFieldElement);
    const forbidSummonFieldElement = normalizeElementName(raw.forbidSummonFieldElement || raw.blockSummonFieldElement);
    const requireSelfFieldElement = normalizeElementName(raw.requireSelfFieldElement || raw.selfFieldElement);
    const forbidSelfFieldElement = normalizeElementName(raw.forbidSelfFieldElement || raw.selfFieldNotElement);
    const requireSummonUnitElement = normalizeElementName(raw.requireSummonUnitElement || raw.summonElement);
    return {
      amount,
      summonOwner,
      requireSummonFieldElement,
      forbidSummonFieldElement,
      requireSelfFieldElement,
      forbidSelfFieldElement,
      requireSummonUnitElement,
    };
  }
  return null;
}

function normalizeManaConfigs(raw) {
  const list = [];
  for (const entry of toArray(raw)) {
    const cfg = normalizeManaConfigEntry(entry);
    if (cfg) list.push(cfg);
  }
  return list;
}

function shouldTriggerConfig(cfg, context) {
  const {
    abilityOwner,
    abilityCellElement,
    summonOwner,
    summonFieldElement,
    summonUnitElement,
  } = context;

  const trigger = cfg.summonOwner || 'ALLY';
  if (trigger === 'ALLY' && summonOwner !== abilityOwner) return false;
  if (trigger === 'ENEMY') {
    if (summonOwner == null) return false;
    if (summonOwner === abilityOwner) return false;
  }

  if (cfg.requireSummonFieldElement && cfg.requireSummonFieldElement !== summonFieldElement) {
    return false;
  }
  if (cfg.forbidSummonFieldElement && cfg.forbidSummonFieldElement === summonFieldElement) {
    return false;
  }
  if (cfg.requireSelfFieldElement && cfg.requireSelfFieldElement !== abilityCellElement) {
    return false;
  }
  if (cfg.forbidSelfFieldElement && cfg.forbidSelfFieldElement === abilityCellElement) {
    return false;
  }
  if (cfg.requireSummonUnitElement && cfg.requireSummonUnitElement !== summonUnitElement) {
    return false;
  }
  return true;
}

export function applyManaGainOnSummon(state, context = {}) {
  const events = [];
  if (!state?.board || !Array.isArray(state.players)) return events;

  const summonOwner = context.unit?.owner ?? null;
  const summonCell = state.board?.[context.r]?.[context.c] || null;
  const summonFieldElement = normalizeElementName(summonCell?.element);
  const summonTpl = context.unit ? CARDS[context.unit.tplId] : null;
  const summonUnitElement = normalizeElementName(summonTpl?.element);

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = state.board?.[r]?.[c];
      const abilityUnit = cell?.unit;
      if (!abilityUnit) continue;
      const owner = abilityUnit.owner;
      if (owner == null) continue;
      const abilityTpl = CARDS[abilityUnit.tplId];
      if (!abilityTpl) continue;
      const configs = normalizeManaConfigs(abilityTpl.manaOnSummon);
      if (!configs.length) continue;
      const abilityCellElement = normalizeElementName(cell.element);

      for (const cfg of configs) {
        if (!cfg) continue;
        const ok = shouldTriggerConfig(cfg, {
          abilityOwner: owner,
          abilityCellElement,
          summonOwner,
          summonFieldElement,
          summonUnitElement,
        });
        if (!ok) continue;
        const player = state.players[owner];
        if (!player) continue;
        const before = Number.isFinite(player.mana) ? player.mana : 0;
        const after = capMana(before + cfg.amount);
        const gained = after - before;
        if (gained <= 0) continue;
        player.mana = after;
        const sourceName = abilityTpl.name || 'Существо';
        const log = `${sourceName}: игрок ${owner + 1} получает ${gained} маны.`;

        events.push({
          owner,
          amount: gained,
          before,
          after,
          r,
          c,
          source: { tplId: abilityTpl.id, name: abilityTpl.name },
          log,
          origin: 'SUMMON_MANA_AURA',
        });
      }
    }
  }

  return events;
}

export default { applyManaGainOnSummon };
