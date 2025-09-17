// Логика формирования и выбора профилей атак (без привязки к визуализации)
import { CARDS } from './cards.js';

function cloneAttacks(attacks) {
  if (!Array.isArray(attacks)) return [];
  return attacks.map(a => ({
    dir: a.dir,
    ranges: Array.isArray(a.ranges) ? a.ranges.slice() : (a.ranges != null ? [a.ranges] : [1]),
    mode: a.mode,
  }));
}

function buildBaseProfile(tpl, hasAlternatives) {
  const baseAttacks = cloneAttacks(tpl.attacks);
  return {
    id: 'BASE',
    key: 'base',
    label: hasAlternatives ? 'Base' : (tpl.attackProfileLabel || null),
    attackType: tpl.attackType || 'STANDARD',
    attacks: baseAttacks,
    blindspots: Array.isArray(tpl.blindspots) ? tpl.blindspots.slice() : [],
    forced: false,
    condition: null,
    area: tpl.magicArea || null,
    restrictTargets: false,
    setAttackToFieldCount: null,
  };
}

function normalizeAltProfile(base, cfg, index) {
  const alt = {
    id: cfg.id || `ALT_${index + 1}`,
    key: cfg.key || `alt_${index + 1}`,
    label: cfg.label || 'Alt',
    attackType: cfg.attackType || base.attackType,
    attacks: cloneAttacks(cfg.attacks || base.attacks),
    blindspots: Array.isArray(cfg.blindspots) ? cfg.blindspots.slice() : base.blindspots.slice(),
    forced: !!cfg.forced,
    condition: cfg.condition || null,
    area: cfg.area || cfg.magicArea || null,
    restrictTargets: !!cfg.restrictTargets,
    setAttackToFieldCount: cfg.setAttackToFieldCount || null,
  };
  return alt;
}

function evaluateCondition(condition, context) {
  if (!condition) return true;
  const { cellElement } = context;
  switch (condition.type) {
    case 'FIELD_ELEMENT':
      return cellElement === condition.element;
    case 'NOT_FIELD_ELEMENT':
      return cellElement !== condition.element;
    default:
      return true;
  }
}

export function getCardAttackProfiles(cardLike) {
  if (!cardLike) return [];
  const tpl = cardLike.id && CARDS[cardLike.id] ? CARDS[cardLike.id] : cardLike;
  const alts = Array.isArray(tpl.alternateAttackProfiles) ? tpl.alternateAttackProfiles : [];
  const profiles = [];
  const base = buildBaseProfile(tpl, alts.length > 0);
  profiles.push(base);
  alts.forEach((cfg, idx) => {
    profiles.push(normalizeAltProfile(base, cfg, idx));
  });
  return profiles;
}

export function resolveActiveAttackProfile(state, r, c, opts = {}) {
  const cell = state?.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) {
    const tplFallback = opts.cardTemplate || null;
    const profiles = getCardAttackProfiles(tplFallback);
    return profiles[0] || buildBaseProfile(tplFallback || {}, false);
  }
  const tpl = CARDS[unit.tplId];
  const profiles = getCardAttackProfiles(tpl);
  if (!profiles.length) {
    return buildBaseProfile(tpl || {}, false);
  }
  let active = profiles[0];
  for (let i = 1; i < profiles.length; i++) {
    const candidate = profiles[i];
    const matches = evaluateCondition(candidate.condition, { cellElement: cell.element, state, unit, position: { r, c } });
    if (matches) {
      active = candidate;
      if (candidate.forced) return candidate;
    }
  }
  return active;
}

export function listAttackProfilesForDisplay(cardLike) {
  return getCardAttackProfiles(cardLike);
}
