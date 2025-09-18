// Обработчики стоимости активации и аур, влияющих на AP
// Логика отделена от визуальной части и может переиспользоваться на других движках

import { CARDS } from '../cards.js';

function normalizeAuraConfig(raw) {
  if (!raw) return null;
  if (raw === true) return { amount: 1, vs: 'ENEMY', radius: 1 };
  if (typeof raw === 'number') {
    return { amount: raw, vs: 'ENEMY', radius: 1 };
  }
  if (typeof raw === 'object') {
    const amount = Number(raw.amount ?? raw.value ?? 0);
    const vs = typeof raw.vs === 'string' ? raw.vs.toUpperCase() : (raw.target ? String(raw.target).toUpperCase() : 'ENEMY');
    const radius = Math.max(0, raw.radius != null ? Math.floor(raw.radius) : 1);
    const affectSelf = raw.affectSelf === true;
    const stackable = raw.stackable !== false;
    return { amount, vs, radius, affectSelf, stackable };
  }
  return null;
}

function appliesToTarget(cfg, auraUnit, targetUnit) {
  if (!cfg || !auraUnit || !targetUnit) return false;
  if (cfg.vs === 'ALLY' && auraUnit.owner !== targetUnit.owner) return false;
  if (cfg.vs === 'ENEMY' && auraUnit.owner === targetUnit.owner) return false;
  return true;
}

function manhattanDistance(r1, c1, r2, c2) {
  return Math.abs((r1 ?? 0) - (r2 ?? 0)) + Math.abs((c1 ?? 0) - (c2 ?? 0));
}

export function collectActivationTax(state, r, c, unitOverride = null) {
  const result = { total: 0, breakdown: [] };
  if (!state?.board) return result;
  const unit = unitOverride || state.board?.[r]?.[c]?.unit;
  if (!unit) return result;
  const tplUnit = CARDS[unit.tplId];
  if (!tplUnit) return result;

  const seenSources = new Set();

  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      const auraUnit = state.board?.[rr]?.[cc]?.unit;
      if (!auraUnit) continue;
      if ((auraUnit.currentHP ?? CARDS[auraUnit.tplId]?.hp ?? 0) <= 0) continue;
      const auraTpl = CARDS[auraUnit.tplId];
      const cfg = normalizeAuraConfig(auraTpl?.activationTaxAura);
      if (!cfg || cfg.amount === 0) continue;
      if (!cfg.affectSelf && auraUnit === unit) continue;
      if (!appliesToTarget(cfg, auraUnit, unit)) continue;
      const dist = manhattanDistance(rr, cc, r, c);
      if (dist > cfg.radius) continue;
      const key = `${rr},${cc}`;
      if (!cfg.stackable && seenSources.has(key)) continue;
      result.total += cfg.amount;
      result.breakdown.push({
        amount: cfg.amount,
        source: {
          tplId: auraTpl?.id ?? auraUnit.tplId ?? null,
          name: auraTpl?.name || null,
          position: { r: rr, c: cc },
        },
      });
      seenSources.add(key);
    }
  }

  return result;
}
