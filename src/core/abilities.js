// Общие функции для обработки особых свойств карт
import { CARDS } from './cards.js';

// локальная функция ограничения маны (без импорта во избежание циклов)
const capMana = (m) => Math.min(10, m);

// базовая стоимость активации без каких‑либо скидок
function baseActivationCost(tpl) {
  return tpl && tpl.activation != null
    ? tpl.activation
    : Math.max(0, (tpl && tpl.cost ? tpl.cost - 1 : 0));
}

// фактическая стоимость атаки с учётом скидок (например, "активация на X меньше")
export function activationCost(tpl, fieldElement) {
  let cost = baseActivationCost(tpl);
  if (tpl && tpl.activationReduction) {
    cost = Math.max(0, cost - tpl.activationReduction);
  }
  const onElem = tpl && tpl.activationReductionOnElement;
  if (onElem && fieldElement === onElem.element) {
    cost = Math.max(0, cost - onElem.reduction);
  }
  return cost;
}

// стоимость поворота/обычной активации — без скидок
export const rotateCost = (tpl) => baseActivationCost(tpl);

// Проверка наличия способности "быстрота"
export const hasFirstStrike = (tpl) => !!(tpl && tpl.firstStrike);

// Проверка способности "двойная атака"
export const hasDoubleAttack = (tpl) => !!(tpl && tpl.doubleAttack);

// Может ли существо атаковать (крепости не могут)
export const canAttack = (tpl) => !(tpl && tpl.fortress);

// Реализация ауры Фридонийского Странника при призыве союзников
// Возвращает количество полученных единиц маны
export function applyFreedonianAura(state, owner) {
  let gained = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (tpl?.auraGainManaOnSummon && unit.owner === owner && cell.element !== 'FIRE') {
        const pl = state.players[owner];
        pl.mana = capMana((pl.mana || 0) + 1);
        gained += 1;
      }
    }
  }
  return gained;
}

// === Вспомогательные структуры для продвинутых способностей ===
const DIR_VECTORS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function rotateDir(facing, dir) {
  const table = {
    N: { N: 'N', E: 'E', S: 'S', W: 'W' },
    E: { N: 'E', E: 'S', S: 'W', W: 'N' },
    S: { N: 'S', E: 'W', S: 'N', W: 'E' },
    W: { N: 'W', E: 'N', S: 'E', W: 'S' },
  };
  return table[facing]?.[dir] || dir;
}

const normalizePlusField = (tpl) => {
  if (tpl?.plusAtkIfTargetOnElement) return tpl.plusAtkIfTargetOnElement;
  if (tpl?.plus1IfTargetOnElement) return { element: tpl.plus1IfTargetOnElement, amount: 1 };
  return null;
};

export function countFieldsByElement(state, element) {
  let total = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board?.[r]?.[c]?.element === element) total++;
    }
  }
  return total;
}

export function getAttackContext(state, r, c) {
  const cell = state.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return null;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return null;

  const context = {
    tpl,
    attacks: Array.isArray(tpl.attacks) ? tpl.attacks : [],
    attackType: tpl.attackType || 'STANDARD',
    chooseDir: !!tpl.chooseDir,
    friendlyFire: !!tpl.friendlyFire,
    pierce: !!tpl.pierce,
    dynamicAtk: tpl.dynamicAtk || null,
    dynamicMagicAtk: tpl.dynamicMagicAtk || null,
    randomPlus2: !!tpl.randomPlus2,
    penaltyByTargets: tpl.penaltyByTargets || null,
    plusAtkIfTargetOnElement: normalizePlusField(tpl),
    plusAtkIfTargetCreatureElement: tpl.plusAtkIfTargetCreatureElement || null,
    magicArea: tpl.magicArea || (tpl.magicAttackArea ? 'TARGET_ORTHOGONAL' : null),
    useAttacksForTargeting: !!tpl.magicUsesAttacksPattern,
  };

  const cellElement = cell.element;
  const altMagic = tpl.altMagic;
  if (altMagic && cellElement === altMagic.element) {
    context.attackType = altMagic.attackType || 'MAGIC';
    context.attacks = Array.isArray(altMagic.attacks) && altMagic.attacks.length
      ? altMagic.attacks
      : context.attacks;
    context.chooseDir = altMagic.useAttacksPattern != null
      ? !!altMagic.useAttacksPattern
      : context.chooseDir;
    if (altMagic.chooseDir != null) context.chooseDir = !!altMagic.chooseDir;
    context.friendlyFire = altMagic.friendlyFire != null
      ? !!altMagic.friendlyFire
      : false;
    context.pierce = altMagic.pierce != null
      ? !!altMagic.pierce
      : context.pierce;
    context.dynamicAtk = altMagic.dynamicAtk || context.dynamicAtk;
    context.dynamicMagicAtk = altMagic.dynamicMagicAtk || context.dynamicMagicAtk || context.dynamicAtk;
    context.magicArea = altMagic.area || context.magicArea;
    context.useAttacksForTargeting = altMagic.useAttacksPattern != null
      ? !!altMagic.useAttacksPattern
      : true;
    context.forcedMagic = true;
    context.altLabel = altMagic.label || null;
  }

  return context;
}

export function listMagicTargetCells(state, r, c, ctx = null) {
  const cell = state.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return [];
  const context = ctx || getAttackContext(state, r, c);
  if (!context || context.attackType !== 'MAGIC') return [];

  const results = [];
  if (context.useAttacksForTargeting && (context.attacks || []).length) {
    const facing = unit.facing || 'N';
    for (const pattern of context.attacks) {
      const ranges = Array.isArray(pattern.ranges) ? pattern.ranges : [1];
      for (const dist of ranges) {
        const dirAbs = rotateDir(facing, pattern.dir);
        const vec = DIR_VECTORS[dirAbs]; if (!vec) continue;
        const nr = r + vec[0] * dist;
        const nc = c + vec[1] * dist;
        if (!inBounds(nr, nc)) continue;
        if (!results.some(p => p.r === nr && p.c === nc)) {
          results.push({ r: nr, c: nc });
        }
      }
    }
  } else {
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        if (rr === r && cc === c) continue;
        results.push({ r: rr, c: cc });
      }
    }
  }
  return results;
}

export function applyOnSummonAbilities(state, r, c) {
  const logs = [];
  const cell = state.board?.[r]?.[c];
  const unit = cell?.unit;
  if (!unit) return logs;
  const tpl = CARDS[unit.tplId];
  if (!tpl) return logs;

  const possessionCfg = tpl.onSummonPossessEnemiesOnElement;
  if (possessionCfg) {
    const targetElement = possessionCfg.targetElement || possessionCfg.element || possessionCfg;
    const requireNot = possessionCfg.requireFieldNot ?? possessionCfg.requireNotOn;
    const requireOn = possessionCfg.requireFieldOn ?? possessionCfg.requireOn;
    const cellElement = cell.element;
    if ((requireOn == null || cellElement === requireOn) && (requireNot == null || cellElement !== requireNot)) {
      let taken = 0;
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          if (rr === r && cc === c) continue;
          const targetCell = state.board?.[rr]?.[cc];
          if (!targetCell || targetCell.element !== targetElement) continue;
          const victim = targetCell.unit;
          if (!victim || victim.owner === unit.owner) continue;
          const tplVictim = CARDS[victim.tplId];
          const originalOwner = victim.possession?.originalOwner ?? victim.owner;
          victim.possession = {
            by: unit.owner,
            sourceUid: unit.uid,
            originalOwner,
            noWinCount: true,
          };
          victim.owner = unit.owner;
          victim.possessed = true;
          taken += 1;
          const ownerName = state.players?.[unit.owner]?.name || `Player ${unit.owner + 1}`;
          const targetName = tplVictim?.name || 'Unit';
          logs.push(`${tpl.name}: ${targetName} переходит под контроль ${ownerName}.`);
        }
      }
      if (taken > 1) {
        logs.push(`${tpl.name}: всего захвачено ${taken} существ.`);
      }
    }
  }

  return logs;
}

export function releasePossessionsBySource(state, sourceUid) {
  if (!sourceUid) return [];
  const logs = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      if (!unit || !unit.possession) continue;
      if (unit.possession.sourceUid !== sourceUid) continue;
      const originalOwner = unit.possession.originalOwner ?? unit.owner;
      const tplUnit = CARDS[unit.tplId];
      const ownerName = state.players?.[originalOwner]?.name || `Player ${originalOwner + 1}`;
      unit.owner = originalOwner;
      delete unit.possessed;
      delete unit.possession;
      logs.push(`${tplUnit?.name || 'Unit'} возвращается под контроль ${ownerName}.`);
    }
  }
  return logs;
}

export function handleDeathsAbilities(state, deaths = []) {
  const logs = [];
  if (!Array.isArray(deaths)) return logs;
  for (const d of deaths) {
    if (!d || !d.uid) continue;
    const released = releasePossessionsBySource(state, d.uid);
    for (const line of released) {
      logs.push(line);
    }
  }
  return logs;
}
