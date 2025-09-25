// Модуль для условных баффов, зависящих от текущих характеристик юнита
// Логика отделена от визуальной части, чтобы её можно было перенести в другие движки (например, Unity)

function normalizeHpEquals(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { hp: Math.max(0, Math.trunc(raw)) };
  }
  if (typeof raw === 'object') {
    const hpValue = raw.hp ?? raw.value ?? raw.eq ?? raw.equals ?? raw.threshold;
    if (hpValue == null) return null;
    const hp = Number(hpValue);
    if (!Number.isFinite(hp)) return null;
    const normalized = { hp: Math.max(0, Math.trunc(hp)) };
    if (raw.amount != null) {
      const amount = Number(raw.amount);
      if (Number.isFinite(amount)) {
        normalized.amount = amount;
      }
    }
    if (raw.plus != null) {
      const amount = Number(raw.plus);
      if (Number.isFinite(amount)) {
        normalized.amount = amount;
      }
    }
    if (raw.add != null) {
      const amount = Number(raw.add);
      if (Number.isFinite(amount)) {
        normalized.amount = amount;
      }
    }
    if (raw.attack != null) {
      const amount = Number(raw.attack);
      if (Number.isFinite(amount)) {
        normalized.amount = amount;
      }
    }
    if (raw.attempts != null) {
      const attempts = Number(raw.attempts);
      if (Number.isFinite(attempts)) {
        normalized.attempts = Math.max(0, Math.trunc(attempts));
      }
    }
    if (raw.count != null) {
      const attempts = Number(raw.count);
      if (Number.isFinite(attempts)) {
        normalized.attempts = Math.max(0, Math.trunc(attempts));
      }
    }
    if (raw.limit != null) {
      const attempts = Number(raw.limit);
      if (Number.isFinite(attempts)) {
        normalized.attempts = Math.max(0, Math.trunc(attempts));
      }
    }
    if (raw.chance != null && Number.isFinite(Number(raw.chance))) {
      const chance = Number(raw.chance);
      normalized.chance = Math.max(0, Math.min(1, chance));
    }
    if (raw.probability != null && Number.isFinite(Number(raw.probability))) {
      const chance = Number(raw.probability);
      normalized.chance = Math.max(0, Math.min(1, chance));
    }
    if (raw.rate != null && Number.isFinite(Number(raw.rate))) {
      const chance = Number(raw.rate);
      normalized.chance = Math.max(0, Math.min(1, chance));
    }
    return normalized;
  }
  return null;
}

function computeCurrentHp(unit, tpl) {
  if (typeof unit?.currentHP === 'number' && Number.isFinite(unit.currentHP)) {
    return unit.currentHP;
  }
  if (typeof tpl?.hp === 'number' && Number.isFinite(tpl.hp)) {
    return tpl.hp;
  }
  return null;
}

export function computeHpAttackBonus(unit, tpl) {
  if (!unit || !tpl) return null;
  const cfgRaw = tpl.plusAtkWhenHpEquals || tpl.attackBonusWhenHpEquals;
  if (!cfgRaw) return null;
  const cfg = normalizeHpEquals(cfgRaw);
  if (!cfg || cfg.amount == null) return null;
  const current = computeCurrentHp(unit, tpl);
  if (current == null) return null;
  if (current !== cfg.hp) return null;
  const amount = Number(cfg.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return { amount, hp: cfg.hp };
}

export function computeHpConditionalDodge(unit, tpl) {
  if (!unit || !tpl) return null;
  const cfgRaw = tpl.gainDodgeWhenHpEquals || tpl.dodgeWhenHpEquals;
  if (!cfgRaw) return null;
  const cfg = normalizeHpEquals(cfgRaw);
  if (!cfg) return null;
  const current = computeCurrentHp(unit, tpl);
  if (current == null) return null;
  if (current !== cfg.hp) return null;
  const attempts = (cfg.attempts != null) ? cfg.attempts : 1;
  if (attempts <= 0) return null;
  const chance = (cfg.chance != null) ? cfg.chance : 0.5;
  return {
    attempts: Math.max(0, Math.trunc(attempts)),
    chance: Math.max(0, Math.min(1, chance)),
    hp: cfg.hp,
    keyword: attempts === 1 ? 'DODGE_ATTEMPT' : 'DODGE_ATTEMPT',
    resetEachRefresh: true,
  };
}

export default {
  computeHpAttackBonus,
  computeHpConditionalDodge,
};
