// Модуль для обработки эффектов, зависящих от текущего состояния самого существа
// Держим логику изолированной от визуальной части для возможного переноса на другие движки

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clampChance(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function normalizeEffect(raw) {
  if (!raw) return null;
  if (typeof raw !== 'object') return null;
  const equalsRaw = raw.hpEquals ?? raw.equals ?? raw.eq ?? raw.hp ?? raw.value;
  const equals = Number.isFinite(equalsRaw) ? Math.floor(equalsRaw) : null;
  if (equals == null) return null;
  const atkBonusRaw = raw.atkBonus ?? raw.atk ?? raw.plusAtk ?? raw.attackBonus;
  const dodgeAttemptsRaw = raw.dodgeAttempts ?? raw.dodge ?? raw.attempts ?? raw.dodgeAttempt;
  const dodgeChanceRaw = raw.dodgeChance ?? raw.chance ?? raw.dodgeRate;

  const effect = { hpEquals: equals };
  if (Number.isFinite(atkBonusRaw) && atkBonusRaw !== 0) {
    effect.atkBonus = Math.floor(atkBonusRaw);
  }
  if (Number.isFinite(dodgeAttemptsRaw) && dodgeAttemptsRaw > 0) {
    effect.dodgeAttempts = Math.max(0, Math.floor(dodgeAttemptsRaw));
  }
  const chance = clampChance(dodgeChanceRaw);
  if (chance != null) {
    effect.dodgeChance = chance;
  }
  if (!effect.atkBonus && !effect.dodgeAttempts && effect.dodgeChance == null) {
    return null;
  }
  return effect;
}

function collectEffects(tpl) {
  const raw = tpl?.hpConditionalEffects || tpl?.selfHpConditionalEffects;
  const list = [];
  for (const item of toArray(raw)) {
    const normalized = normalizeEffect(item);
    if (normalized) list.push(normalized);
  }
  return list;
}

function getUnitCurrentHp(unit, tpl) {
  if (!unit) return null;
  if (typeof unit.currentHP === 'number' && Number.isFinite(unit.currentHP)) {
    return unit.currentHP;
  }
  if (typeof tpl?.hp === 'number' && Number.isFinite(tpl.hp)) {
    return tpl.hp;
  }
  return null;
}

export function computeSelfHpAttackBonus(state, r, c, tpl) {
  if (!tpl) return null;
  const effects = collectEffects(tpl);
  if (!effects.length) return null;
  const unit = state?.board?.[r]?.[c]?.unit;
  if (!unit) return null;
  const currentHp = getUnitCurrentHp(unit, tpl);
  if (currentHp == null) return null;
  let total = 0;
  for (const effect of effects) {
    if (effect.hpEquals === currentHp && effect.atkBonus) {
      total += effect.atkBonus;
    }
  }
  if (!total) return null;
  return { amount: total, hp: currentHp };
}

export function computeSelfHpDodgeBonus(state, r, c, tpl) {
  if (!tpl) return null;
  const effects = collectEffects(tpl);
  if (!effects.length) return null;
  const unit = state?.board?.[r]?.[c]?.unit;
  if (!unit) return null;
  const currentHp = getUnitCurrentHp(unit, tpl);
  if (currentHp == null) return null;
  let attempts = 0;
  let chance = null;
  for (const effect of effects) {
    if (effect.hpEquals !== currentHp) continue;
    if (effect.dodgeAttempts) {
      attempts += effect.dodgeAttempts;
    }
    if (effect.dodgeChance != null) {
      chance = effect.dodgeChance;
    }
  }
  if (attempts <= 0 && chance == null) return null;
  return { attempts, chance, hp: currentHp };
}

export default {
  computeSelfHpAttackBonus,
  computeSelfHpDodgeBonus,
};
