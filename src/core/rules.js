// Pure game rules helpers (no DOM/THREE/GSAP/socket)
import { DIR_VECTORS, inBounds, attackCost, capMana } from './constants.js';
import { CARDS } from './cards.js';
import {
  hasFirstStrike,
  hasDoubleAttack,
  canAttack,
  getTargetElementBonus,
  getTargetCostBonus,
  getTargetHpBonus,
  getAuraAttackBonus,
  collectMagicTargetCells,
  computeDynamicMagicAttack,
  releasePossessionsAfterDeaths,
  refreshContinuousPossessions,
  hasPerfectDodge,
  hasInvisibility,
  attemptUnitDodge,
  collectDamageInteractions,
  applyDamageInteractionResults,
  resolveAttackProfile,
  refreshBoardDodgeStates,
  getUnitProtection,
} from './abilities.js';
import { computeCellBuff } from './fieldEffects.js';
import { normalizeElementName } from './utils/elements.js';
import { computeDynamicAttackBonus } from './abilityHandlers/dynamicAttack.js';
import { getHpConditionalBonuses } from './abilityHandlers/conditionalBonuses.js';
import { applyDeathDiscardEffects } from './abilityHandlers/discard.js';
import { applyManaGainOnDeaths } from './abilityHandlers/manaGain.js';
import { applyDeathManaSteal } from './abilityHandlers/manaSteal.js';
import { applyDeathRepositionEffects } from './abilityHandlers/deathReposition.js';
import { createDeathEntry } from './abilityHandlers/deathRecords.js';

export function hasAdjacentGuard(state, r, c) {
  const target = state.board?.[r]?.[c]?.unit;
  if (!target) return false;
  for (const [dr, dc] of Object.values(DIR_VECTORS)) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const u = state.board[nr][nc]?.unit;
    if (u && u.owner === target.owner && ((CARDS[u.tplId].keywords || []).includes('GUARD'))) return true;
  }
  return false;
}

// Поворот относительного направления в абсолютное
function rotateDir(facing, dir) {
  const table = {
    N: { N: 'N', E: 'E', S: 'S', W: 'W' },
    E: { N: 'E', E: 'S', S: 'W', W: 'N' },
    S: { N: 'S', E: 'W', S: 'N', W: 'E' },
    W: { N: 'W', E: 'N', S: 'E', W: 'S' },
  };
  return table[facing]?.[dir] || dir;
}

// Возвращает все потенциальные клетки атаки без учёта препятствий
function attackCellsFromProfile(profile, tpl, facing, opts = {}) {
  const res = [];
  const attacks = (Array.isArray(profile?.attacks) && profile.attacks.length)
    ? profile.attacks
    : (tpl.attacks || []);
  const { chosenDir, rangeChoices, union } = opts;
  const chooseDir = profile?.chooseDir ?? !!tpl?.chooseDir;
  let seq = 0;
  for (const a of attacks) {
    if (!union && chooseDir) {
      if (!chosenDir) continue; // направление нужно выбрать явно
      if (a.dir !== chosenDir) continue;
    }
    const dirAbs = rotateDir(facing, a.dir);
    const ranges = Array.isArray(a.ranges) ? a.ranges.slice() : [1];
    let used = ranges;
    // mode: 'ANY' означает выбор одной из дистанций (напр. ближняя или дальняя)
    if (a.mode === 'ANY' && !union) {
      const chosen = rangeChoices?.[a.dir];
      used = [chosen ?? ranges[0]];
    }
    const baseGroup = (a.group != null) ? `combo-${String(a.group)}` : null;
    const ignoreBlocking = !!a.ignoreBlocking;
    const ignoreAllyBlocking = !!(a.ignoreAlliedBlocking || a.ignoreFriendlyBlocking || a.skipAlliedBlocking);
    for (const r of used) {
      const groupId = baseGroup ?? `g-${seq++}`;
      res.push({ dirAbs, range: r, dirRel: a.dir, groupId, ignoreBlocking, ignoreAllyBlocking });
    }
  }
  return res;
}

// Compute effective stats (handles temp buffs if present on cell)
export function effectiveStats(cell, unit, opts = {}) {
  const tpl = unit ? CARDS[unit.tplId] : null;
  const buff = computeCellBuff(cell?.element, tpl?.element);
  const tempAtk = typeof unit?.tempAtkBuff === 'number' ? unit.tempAtkBuff : 0;
  const permAtk = typeof unit?.permanentAtkBuff === 'number' ? unit.permanentAtkBuff : 0;
  let atk = (tpl?.atk || 0) + buff.atk + tempAtk + permAtk;
  const extra = typeof unit?.bonusHP === 'number' ? unit.bonusHP : 0;
  let hp = (tpl?.hp || 0) + buff.hp + extra;
  const state = opts?.state;
  if (state) {
    const posR = typeof opts.r === 'number' ? opts.r : (opts.position?.r ?? null);
    const posC = typeof opts.c === 'number' ? opts.c : (opts.position?.c ?? null);
    if (typeof posR === 'number' && typeof posC === 'number') {
      const aura = getAuraAttackBonus(state, posR, posC, {
        unit,
        tpl,
        owner: opts.owner ?? unit?.owner,
      });
      if (aura) {
        atk += aura;
      }
    }
  }
  const hpConditional = getHpConditionalBonuses(unit, tpl);
  if (hpConditional?.attackBonus) {
    atk += hpConditional.attackBonus;
  }
  return { atk: Math.max(0, Math.floor(atk)), hp: Math.max(0, Math.floor(hp)) };
}

export function computeHits(state, r, c, opts = {}) {
  const cell = state.board?.[r]?.[c];
  const attacker = cell?.unit;
  if (!attacker) {
    const empty = [];
    empty.profile = null;
    empty.schemeKey = null;
    empty.attackType = null;
    return empty;
  }
  const tplA = CARDS[attacker.tplId];
  const profile = opts.profile || resolveAttackProfile(state, r, c, tplA, { unit: attacker, cell });
  const attackType = profile?.attackType || tplA?.attackType || 'STANDARD';
  // tplA.friendlyFire — может ли атака задевать союзников
  const cells = attackCellsFromProfile(profile, tplA, attacker.facing, opts);
  const { atk } = effectiveStats(cell, attacker, { state, r, c });
  const hits = [];
  hits.profile = profile;
  hits.schemeKey = profile?.schemeKey || null;
  hits.attackType = attackType;
  const aFlying = (tplA.keywords || []).includes('FLYING');
  const basePierce = !!tplA.pierce;
  const baseSkipAllies = !!(tplA.ignoreAlliedBlocking || tplA.ignoreFriendlyBlocking || tplA.skipAlliedBlocking);
  const allowFriendly = !!tplA.friendlyFire; // может ли существо задевать союзников
  const forceBackAttack = !!tplA.backAttack;
  const retaliationRangeCap = opts.retaliation && typeof tplA?.retaliationRangeCap === 'number'
    ? tplA.retaliationRangeCap
    : null;
  const grouped = new Map();
  let fallbackIdx = 0;
  for (const cell of cells) {
    const key = cell.groupId ?? `single-${fallbackIdx++}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(cell);
  }
  for (const groupCells of grouped.values()) {
    const evaluated = [];
    for (const cell of groupCells) {
      const vec = DIR_VECTORS[cell.dirAbs];
      if (!vec) continue;
      const [dr, dc] = vec;
      const nr = r + dr * cell.range;
      const nc = c + dc * cell.range;
      if (!inBounds(nr, nc)) continue;
      if (retaliationRangeCap != null && cell.range > retaliationRangeCap) continue;
      evaluated.push({ cell, dr, dc, nr, nc });
    }
    if (!evaluated.length) continue;

    const considered = [];
    let hasEnemy = false;
    for (const pos of evaluated) {
      const { cell, dr, dc, nr, nc } = pos;
      const allowPierce = basePierce || cell.ignoreBlocking;
      const skipAlliedBlocking = baseSkipAllies || cell.ignoreAllyBlocking;

      if (!allowPierce) {
        let blocked = false;
        for (let step = 1; step < cell.range; step++) {
          const tr = r + dr * step;
          const tc = c + dc * step;
          const uMid = state.board?.[tr]?.[tc]?.unit;
          if (uMid && (uMid.currentHP ?? CARDS[uMid.tplId]?.hp) > 0) {
            if (skipAlliedBlocking && uMid.owner === attacker.owner) continue;
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
      }

      let unit = state.board?.[nr]?.[nc]?.unit;
      if (unit && (unit.currentHP ?? CARDS[unit.tplId]?.hp) <= 0) unit = null;
      if (unit && unit.owner !== attacker.owner) hasEnemy = true;
      considered.push({ ...pos, nr, nc, unit });
    }
    if (!considered.length) continue;

    if (opts.target) {
      const match = considered.some(pos => pos.nr === opts.target.r && pos.nc === opts.target.c);
      if (!match) continue;
    }

    const multiGroup = groupCells.length > 1;
    const allowAlliedHits = allowFriendly || (multiGroup && hasEnemy);
    if (!hasEnemy && !allowFriendly) {
      if (opts.includeEmpty) {
        for (const pos of considered) {
          if (!pos.unit || pos.unit.owner === attacker.owner) {
            hits.push({ r: pos.nr, c: pos.nc, dmg: 0 });
          }
        }
      }
      continue;
    }

    for (const pos of considered) {
      const { nr, nc, unit: B } = pos;
      if (!B) {
        if (opts.includeEmpty) hits.push({ r: nr, c: nc, dmg: 0 });
        continue;
      }

      const sameOwner = B.owner === attacker.owner;
      if (sameOwner && !allowAlliedHits) {
        if (opts.includeEmpty) hits.push({ r: nr, c: nc, dmg: 0 });
        continue;
      }

      if (!sameOwner) {
        if (!aFlying && hasAdjacentGuard(state, nr, nc) && !(CARDS[B.tplId].keywords || []).includes('GUARD')) {
          continue; // охрана работает только против врагов
        }
        const backDir = { N: 'S', S: 'N', E: 'W', W: 'E' }[B.facing];
        const drBA = r - nr;
        const dcBA = c - nc;
        let dirAbsFromB;
        if (drBA === 0 && dcBA === 0) {
          dirAbsFromB = backDir || B.facing || 'S';
        } else if (Math.abs(drBA) >= Math.abs(dcBA)) {
          dirAbsFromB = drBA < 0 ? 'N' : 'S';
        } else {
          dirAbsFromB = dcBA < 0 ? 'W' : 'E';
        }
        const ORDER = ['N', 'E', 'S', 'W'];
        const absIdx = ORDER.includes(dirAbsFromB) ? ORDER.indexOf(dirAbsFromB) : 0;
        const faceIdx = ORDER.includes(B.facing) ? ORDER.indexOf(B.facing) : 0;
        const relIdx = (absIdx - faceIdx + 4) % 4;
        let dirRel = ORDER[relIdx];
        let isBack = dirAbsFromB === backDir;
        if (forceBackAttack) {
          isBack = true;
          dirRel = 'S';
        }
        const tplB = CARDS[B.tplId] || {};
        const hasExplicitBlind = Object.prototype.hasOwnProperty.call(tplB, 'blindspots');
        const blindRaw = hasExplicitBlind ? tplB.blindspots : ['S'];
        const blind = Array.isArray(blindRaw) ? blindRaw : ['S'];
        const inBlind = blind.includes(dirRel);
        const extraTotal = inBlind ? 1 : 0;
        const dmg = Math.max(0, atk + extraTotal);
        hits.push({ r: nr, c: nc, dmg, backstab: isBack, sameOwner: false });
        continue;
      }

      // Для мульти-ударов по нескольким клеткам союзники тоже получают урон,
      // если в секторе есть враг
      const dmg = Math.max(0, atk);
      hits.push({ r: nr, c: nc, dmg, backstab: false, sameOwner: true });
    }
  }
  return hits;
}

// New staged attack that exposes step1/step2/finish for UI animation
// Постановочный (staged) бой с поддержкой выбора направления/дистанции
export function stagedAttack(state, r, c, opts = {}) {
  const base = JSON.parse(JSON.stringify(state));
  const cellOrigin = base.board?.[r]?.[c];
  const attacker = cellOrigin?.unit;
  if (!attacker) return null;
  // не позволяем атаковать более одного раза за ход
  if (attacker.lastAttackTurn === base.turn) return null;
  const tplA = CARDS[attacker.tplId];
  if (!canAttack(tplA)) return null;

  const profile = resolveAttackProfile(base, r, c, tplA, { unit: attacker, cell: cellOrigin });
  const attackType = profile?.attackType || tplA.attackType || 'STANDARD';
  const schemeKey = profile?.schemeKey || null;

  const startElement = cellOrigin?.element;
  const attackCostValue = attackCost(tplA, startElement, {
    state: base,
    r,
    c,
    unit: attacker,
    owner: attacker?.owner,
  });

  const baseStats = effectiveStats(cellOrigin, attacker, { state: base, r, c });
  let atk = baseStats.atk;
  let logLines = [];
  const damageEffects = { preventRetaliation: new Set(), events: [] };
  const randomFn = typeof opts?.rng === 'function' ? opts.rng : Math.random;
  const dodgeUpdates = [];

  const hitsRaw = computeHits(base, r, c, { ...opts, profile });
  if (!hitsRaw.length) return { empty: true };

  const dynamicBonus = computeDynamicAttackBonus(base, r, c, tplA);
  if (dynamicBonus?.amount) {
    atk += dynamicBonus.amount;
    if (dynamicBonus.type === 'ELEMENT_CREATURES' && dynamicBonus.element) {
      logLines.push(`${tplA.name}: атака увеличена на ${dynamicBonus.amount} (существа стихии ${dynamicBonus.element})`);
    } else {
      logLines.push(`${tplA.name}: атака увеличена на ${dynamicBonus.amount}`);
    }
  }
  const targetBonus = getTargetElementBonus(tplA, base, hitsRaw);
  const plusCfg = tplA.plusAtkIfTargetOnElement || (tplA.plus1IfTargetOnElement ? { element: tplA.plus1IfTargetOnElement, amount: 1 } : null);
  if (plusCfg) {
    const el = normalizeElementName(plusCfg.element);
    const amount = plusCfg.amount;
    if (el) {
      const has = hitsRaw.some(h => normalizeElementName(base.board?.[h.r]?.[h.c]?.element) === el);
      if (has) {
        atk += amount;
        logLines.push(`${tplA.name}: +${amount} ATK по целям на поле ${el}`);
      }
    }
  }
  const costBonus = getTargetCostBonus(base, tplA, hitsRaw);
  if (costBonus) {
    atk += costBonus.amount;
    logLines.push(`${tplA.name}: +${costBonus.amount} ATK против существ с ценой призыва <= ${costBonus.limit}`);
  }
  const hpBonus = getTargetHpBonus(base, tplA, hitsRaw);
  if (hpBonus) {
    atk += hpBonus.amount;
    logLines.push(`${tplA.name}: +${hpBonus.amount} ATK против существ с HP >= ${hpBonus.threshold}`);
  }
  if (targetBonus) {
    atk += targetBonus.amount;
    logLines.push(`${tplA.name}: +${targetBonus.amount} ATK против существ стихии ${targetBonus.element}`);
  }
  const hpConditional = getHpConditionalBonuses(attacker, tplA);
  if (hpConditional?.attackBonus) {
    logLines.push(`${tplA.name}: +${hpConditional.attackBonus} ATK при ${hpConditional.hp} HP.`);
  }
  if (tplA.randomPlus2 && Math.random() < 0.5) {
    atk += 2;
    logLines.push(`${tplA.name}: случайный бонус +2 ATK`);
  }
  if (tplA.penaltyByTargets) {
    const penalty = tplA.penaltyByTargets[String(hitsRaw.length)] || 0;
    if (penalty) {
      atk += penalty;
      logLines.push(`${tplA.name}: штраф атаки ${penalty}`);
    }
  }
  const deltaAtk = atk - baseStats.atk;
  if (deltaAtk !== 0) {
    for (const h of hitsRaw) { h.dmg = Math.max(0, h.dmg + deltaAtk); }
  }

  const attackerQuick = hasFirstStrike(tplA);
  const quickSources = [];
  const quickRetaliators = [];
  let quickRetaliation = 0;
  for (const h of hitsRaw) {
    if (h?.sameOwner) continue;
    const B = base.board?.[h.r]?.[h.c]?.unit;
    if (!B) continue;
    const tplB = CARDS[B.tplId];
    if (!attackerQuick && hasFirstStrike(tplB)) {
      const hitsB = computeHits(base, h.r, h.c, { target: { r, c }, union: true, retaliation: true });
      if (hitsB.length) {
        const retaliationType = hitsB.attackType || tplB?.attackType || 'STANDARD';
        const isMagicRetaliation = retaliationType === 'MAGIC';
        const attackerPerfect = !isMagicRetaliation && hasPerfectDodge(base, r, c, { unit: attacker, tpl: tplA });
        let dmg = 0;
        if (attackerPerfect) {
          const nameA = tplA?.name || 'Существо';
          const nameB = tplB?.name || 'Существо';
          logLines.push(`${nameA} избегает контратаки ${nameB} благодаря Perfect Dodge.`);
        } else {
          const { atk: batk } = effectiveStats(base.board[h.r][h.c], B, { state: base, r: h.r, c: h.c });
          const baseDmg = Math.max(0, batk);
          const prot = isMagicRetaliation ? 0 : getUnitProtection(base, r, c, { unit: attacker, tpl: tplA });
          dmg = Math.max(0, baseDmg - prot);
        }
        if (dmg > 0) {
          quickRetaliation += dmg;
          quickSources.push(CARDS[B.tplId].name);
          quickRetaliators.push({ r: h.r, c: h.c, dmg });
        }
      }
    }
  }

  const step1Damages = hitsRaw.map(h => {
    const cell = base.board?.[h.r]?.[h.c];
    const B = cell?.unit;
    if (!B) return { ...h, dealt: 0 };
    const sameOwner = B.owner === attacker.owner;
    const isMagic = attackType === 'MAGIC';
    const tplB = CARDS[B.tplId];
    if (sameOwner) {
      // Союзники не уклоняются от массового удара, но учитывают защиту (кроме магии)
      const protection = isMagic
        ? 0
        : getUnitProtection(base, h.r, h.c, { unit: B, tpl: tplB });
      const dealt = Math.max(0, h.dmg - protection);
      return { ...h, dealt, dodge: false, invisible: false, sameOwner: true };
    }
    const invisible = hasInvisibility(base, h.r, h.c, { unit: B, tpl: tplB });
    const perfect = !isMagic && !invisible && hasPerfectDodge(base, h.r, h.c, { unit: B, tpl: tplB });
    let dodgeInfo = null;
    if (!isMagic && !invisible && !perfect) {
      dodgeInfo = attemptUnitDodge(base, h.r, h.c, { rng: randomFn });
    }
    const dodgeSuccess = !isMagic && !invisible && (perfect || (dodgeInfo?.success === true));
    const protection = (invisible || dodgeSuccess || isMagic)
      ? 0
      : getUnitProtection(base, h.r, h.c, { unit: B, tpl: tplB });
    const rawDamage = Math.max(0, h.dmg - protection);
    const dealt = (invisible || dodgeSuccess) ? 0 : rawDamage;
    return { ...h, dealt, dodge: dodgeSuccess, invisible, dodgeInfo, sameOwner: false };
  });

  const n1 = JSON.parse(JSON.stringify(base));
  let quickDone = false;
  let step1Done = false;

  function stepQuick() {
    if (quickDone) return;
    const A = n1.board?.[r]?.[c]?.unit;
    if (quickRetaliation > 0 && A) {
      const before = A.currentHP ?? tplA.hp;
      A.currentHP = Math.max(0, before - quickRetaliation);
      const afterHP = A.currentHP;
      logLines.push(`${quickSources.join(', ')} → ${CARDS[attacker.tplId].name}: ${quickRetaliation} dmg (HP ${before}→${afterHP})`);
    }
    quickDone = true;
  }

  function doStep1() {
    if (step1Done) return;
    stepQuick();
    const A = n1.board?.[r]?.[c]?.unit;
    if (A && ((A.currentHP ?? tplA.hp) > 0 || attackerQuick)) {
      for (const h of step1Damages) {
        const cell = n1.board?.[h.r]?.[h.c];
        const B = cell?.unit; if (!B) continue;
        const tplB2 = CARDS[B.tplId];
        const before = B.currentHP ?? tplB2.hp;
        B.currentHP = Math.max(0, before - (h.dealt || 0));
        const afterHP = B.currentHP;
        const nameA = CARDS[attacker.tplId]?.name || 'Attacker';
        const nameB = CARDS[B.tplId]?.name || 'Target';
        const parts = [`${nameA} → ${nameB}: ${h.dealt || 0} dmg (HP ${before}→${afterHP})`];
        if (h.backstab) parts.push('(+1 backstab)');
        if (h.dodge) parts.push('(dodge)');
        if (h.invisible) parts.push('(невидимость)');
        logLines.push(parts.join(' '));
        if (h.dodgeInfo?.consumed && h.dodgeInfo.limited && (h.dodgeInfo.attemptsLeft ?? 0) <= 0) {
          logLines.push(`${nameB} исчерпывает попытки Dodge.`);
        }
      }
      if (hasDoubleAttack(tplA)) {
        for (const h of step1Damages) {
          const cell2 = n1.board?.[h.r]?.[h.c];
          const B2 = cell2?.unit; if (!B2) continue;
          if ((B2.currentHP ?? CARDS[B2.tplId].hp) <= 0) continue;
          const before2 = B2.currentHP ?? CARDS[B2.tplId].hp;
          B2.currentHP = Math.max(0, before2 - (h.dealt || 0));
          const after2 = B2.currentHP;
          const nameA = CARDS[attacker.tplId]?.name || 'Attacker';
          const nameB = CARDS[B2.tplId]?.name || 'Target';
          logLines.push(`${nameA} (2nd) → ${nameB}: ${h.dealt || 0} dmg (HP ${before2}→${after2})`);
        }
      }
      const interactions = collectDamageInteractions(n1, {
        attackerPos: { r, c },
        attackerUnit: n1.board?.[r]?.[c]?.unit,
        tpl: tplA,
        hits: step1Damages
          .filter(h => !h.sameOwner)
          .map(h => ({ r: h.r, c: h.c, dealt: h.dealt || 0 })),
      });
      if (interactions) {
        const prevents = interactions.preventRetaliation;
        if (prevents instanceof Set || Array.isArray(prevents)) {
          for (const key of prevents) {
            damageEffects.preventRetaliation.add(key);
          }
        }
        if (Array.isArray(interactions.events) && interactions.events.length) {
          damageEffects.events.push(...interactions.events);
        }
      }
    }
    const dodgeStep = refreshBoardDodgeStates(n1);
    if (Array.isArray(dodgeStep?.updated) && dodgeStep.updated.length) {
      dodgeUpdates.push(...dodgeStep.updated);
    }
    step1Done = true;
  }

  function ensureStep1() { if (!step1Done) doStep1(); }

  function step2() {
    ensureStep1();
    let totalRetaliation = 0;
    const retaliators = [];
    for (const h of step1Damages) {
      if (h.sameOwner) continue;
      const preventKey = `${h.r},${h.c}`;
      if (damageEffects.preventRetaliation.has(preventKey)) continue;
      const B = n1.board?.[h.r]?.[h.c]?.unit;
      if (!B) continue;
      const tplB = CARDS[B.tplId];
      const alive = (B.currentHP ?? B.hp) > 0;
      if (!alive) continue;
      if (tplB?.attackType === 'MAGIC' && !tplB?.allowMagicRetaliation) continue;
      // быстрота защитника уже сработала на stepQuick, если атакующий не был быстрым
      if (!attackerQuick && hasFirstStrike(tplB)) continue;
      const hitsB = computeHits(n1, h.r, h.c, { target: { r, c }, union: true, retaliation: true });
      if (hitsB.length) {
        const retaliationType = hitsB.attackType || tplB?.attackType || 'STANDARD';
        const isMagicRetaliation = retaliationType === 'MAGIC';
        const attackerCell = n1.board?.[r]?.[c];
        const attackerUnit = attackerCell?.unit;
        if (!attackerUnit) continue;
        const attackerPerfect = !isMagicRetaliation && hasPerfectDodge(n1, r, c, { unit: attackerUnit, tpl: tplA });
        let dealt = 0;
        if (attackerPerfect) {
          const nameA = tplA?.name || 'Существо';
          const nameB = tplB?.name || 'Существо';
          logLines.push(`${nameA} избегает контратаки ${nameB} благодаря Perfect Dodge.`);
        } else {
          const { atk: batk } = effectiveStats(n1.board[h.r][h.c], B, { state: n1, r: h.r, c: h.c });
          const baseDmg = Math.max(0, batk);
          const protection = isMagicRetaliation ? 0 : getUnitProtection(n1, r, c, { unit: attackerUnit, tpl: tplA });
          dealt = Math.max(0, baseDmg - protection);
        }
        retaliators.push({ r: h.r, c: h.c, dmg: dealt, dodged: attackerPerfect }); // dodged=true означает, что атакующий увернулся
        if (!attackerPerfect && dealt > 0) {
          totalRetaliation += dealt;
        }
      }
    }
    const preventRetaliation = attackType === 'MAGIC' || (tplA.avoidRetaliation50 && Math.random() < 0.5);
    const total = preventRetaliation ? 0 : totalRetaliation;
    return { total, retaliators };
  }

  function finish() {
    ensureStep1();
    const nFinal = JSON.parse(JSON.stringify(n1));
    const ret = step2();

    const applied = applyDamageInteractionResults(nFinal, damageEffects);
    const attackerPosUpdate = applied?.attackerPosUpdate || null;
    const interactionDeaths = Array.isArray(applied?.deaths) ? applied.deaths.slice() : [];
    if (attackerPosUpdate) {
      r = attackerPosUpdate.r;
      c = attackerPosUpdate.c;
    }
    if (Array.isArray(applied?.logLines) && applied.logLines.length) {
      logLines.push(...applied.logLines);
    }

    const A = nFinal.board?.[r]?.[c]?.unit;
    if (A && (ret.total || 0) > 0) {
      const tplA2 = CARDS[A.tplId];
      const before = A.currentHP ?? tplA2.hp;
      A.currentHP = Math.max(0, before - (ret.total || 0));
      logLines.push(`Retaliation to ${CARDS[A.tplId]?.name || 'Attacker'}: ${ret.total || 0} (HP ${before}→${A.currentHP})`);
    }

    const deaths = interactionDeaths.slice();
    const seenDeathKeys = new Set(deaths.map(d => (d?.uid != null)
      ? `UID:${d.uid}`
      : `POS:${d?.r},${d?.c}`));
    for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
      const cellRef = nFinal.board?.[rr]?.[cc];
      const u = cellRef?.unit;
      if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
        const deathEntry = createDeathEntry(nFinal, u, rr, cc) || {
          r: rr,
          c: cc,
          owner: u.owner,
          tplId: u.tplId,
          uid: u.uid ?? null,
          element: cellRef?.element || null,
        };
        const key = (deathEntry.uid != null) ? `UID:${deathEntry.uid}` : `POS:${deathEntry.r},${deathEntry.c}`;
        if (!seenDeathKeys.has(key)) {
          deaths.push(deathEntry);
          seenDeathKeys.add(key);
        }
        if (cellRef) cellRef.unit = null;
      }
    }

    try {
      for (const d of deaths) {
        if (nFinal && nFinal.players && nFinal.players[d.owner]) {
          nFinal.players[d.owner].mana = capMana((nFinal.players[d.owner].mana || 0) + 1);
        }
      }
    } catch {}

    const manaFromDeaths = applyManaGainOnDeaths(nFinal, deaths, { boardState: nFinal });
    if (Array.isArray(manaFromDeaths?.logs) && manaFromDeaths.logs.length) {
      logLines.push(...manaFromDeaths.logs);
    }

    const manaStealEvents = applyDeathManaSteal(nFinal, deaths, { cause: 'BATTLE' });
    if (Array.isArray(manaStealEvents) && manaStealEvents.length) {
      for (const ev of manaStealEvents) {
        if (ev && typeof ev.log === 'string' && ev.log) {
          logLines.push(ev.log);
        }
      }
    }

    const repositionLog = applyDeathRepositionEffects(nFinal, deaths);
    if (Array.isArray(repositionLog?.logs) && repositionLog.logs.length) {
      logLines.push(...repositionLog.logs);
    }

    for (const d of deaths) {
      const tplD = CARDS[d.tplId];
      if (tplD?.onDeathAddHPAll) {
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            const ally = nFinal.board[rr][cc]?.unit;
            if (!ally || ally.owner !== d.owner) continue;
            const tplAlly = CARDS[ally.tplId];
            const buff = computeCellBuff(nFinal.board[rr][cc].element, tplAlly.element);
            const amount = tplD.onDeathAddHPAll;
            ally.bonusHP = (ally.bonusHP || 0) + amount;
            const maxHP = (tplAlly.hp || 0) + buff.hp + (ally.bonusHP || 0);
            const before = ally.currentHP ?? tplAlly.hp;
            ally.currentHP = Math.min(maxHP, before + amount);
          }
        }
        logLines.push(`${tplD.name}: союзники получают +${tplD.onDeathAddHPAll} HP`);
      }
    }

    const discardEffects = applyDeathDiscardEffects(nFinal, deaths, { cause: 'BATTLE' });
    if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
      logLines.push(...discardEffects.logs);
    }

    const releaseEvents = releasePossessionsAfterDeaths(nFinal, deaths);
    if (releaseEvents.releases.length) {
      for (const rel of releaseEvents.releases) {
        const unit = nFinal.board?.[rel.r]?.[rel.c]?.unit;
        const tplRel = unit ? CARDS[unit.tplId] : null;
        const name = tplRel?.name || 'Существо';
        logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
      }
    }

    const continuous = refreshContinuousPossessions(nFinal);
    if (continuous.possessions.length) {
      for (const ev of continuous.possessions) {
        const takenUnit = nFinal.board?.[ev.r]?.[ev.c]?.unit;
        const tplTaken = takenUnit ? CARDS[takenUnit.tplId] : null;
        const name = tplTaken?.name || 'Существо';
        const ownerLabel = (ev.newOwner != null) ? ev.newOwner + 1 : '?';
        logLines.push(`${name}: контроль переходит к игроку ${ownerLabel}.`);
      }
    }
    if (continuous.releases.length) {
      for (const rel of continuous.releases) {
        const unit = nFinal.board?.[rel.r]?.[rel.c]?.unit;
        const tplRel = unit ? CARDS[unit.tplId] : null;
        const name = tplRel?.name || 'Существо';
        logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
      }
    }

    if (A) {
      A.lastAttackTurn = nFinal.turn;
      A.apSpent = (A.apSpent || 0) + attackCostValue;
    }

    const targets = step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 }));
    const combinedReleases = [...releaseEvents.releases, ...continuous.releases];
    const dodgeFinal = refreshBoardDodgeStates(nFinal);
    if (Array.isArray(dodgeFinal?.updated) && dodgeFinal.updated.length) {
      dodgeUpdates.push(...dodgeFinal.updated);
    }
    return {
      n1: nFinal,
      logLines,
      targets,
      deaths,
      retaliators: ret.retaliators,
      releases: combinedReleases,
      possessions: continuous.possessions,
      attackerPosUpdate,
      dodgeUpdates,
      attackType,
      schemeKey,
      attackProfile: profile,
      manaGainEvents: Array.isArray(manaFromDeaths?.entries) ? manaFromDeaths.entries : [],
    };
  }

  return {
    stepQuick,
    step1: doStep1,
    step2,
    finish,
    quickRetaliation,
    quickRetaliators,
    attackerQuick,
    attackType,
    schemeKey,
    attackProfile: profile,
    get nQuick() { stepQuick(); return n1; },
    get n1() { ensureStep1(); return n1; },
    get targetsPreview() { return step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 })); },
    get dodgeSnapshots() { ensureStep1(); return dodgeUpdates.slice(); },
  };
}

export function magicAttack(state, fr, fc, tr, tc) {
  const parseIndex = (value) => {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed)) return parsed;
    }
    return null;
  };

  let fromR = parseIndex(fr);
  let fromC = parseIndex(fc);
  const targetR = parseIndex(tr);
  const targetC = parseIndex(tc);
  if (fromR == null || fromC == null || targetR == null || targetC == null) return null;
  if (!inBounds(fromR, fromC) || !inBounds(targetR, targetC)) return null;

  const n1 = JSON.parse(JSON.stringify(state));
  const originCell = n1.board?.[fromR]?.[fromC];
  const attacker = originCell?.unit;
  if (!attacker) return null;
  // не позволяем магам бить дважды в одном ходу
  if (attacker.lastAttackTurn === n1.turn) return null;
  const tplA = CARDS[attacker.tplId];
  if (!canAttack(tplA)) return null;

  const profile = resolveAttackProfile(n1, fromR, fromC, tplA, { unit: attacker, cell: originCell });
  const attackType = profile?.attackType || tplA.attackType || 'STANDARD';
  const schemeKey = profile?.schemeKey || null;
  if (attackType !== 'MAGIC') return null;

  const startElement = originCell?.element;
  const attackCostValue = attackCost(tplA, startElement, {
    state: n1,
    r: fromR,
    c: fromC,
    unit: attacker,
    owner: attacker?.owner,
  });
  const allowFriendly = !!tplA.friendlyFire;
  const tplForMagic = (profile?.magicAttackArea != null)
    ? { ...tplA, magicAttackArea: profile.magicAttackArea }
    : tplA;
  const mainTarget = n1.board?.[targetR]?.[targetC]?.unit;
  if (!allowFriendly && (!mainTarget || mainTarget.owner === attacker.owner)) return null;

  const logLines = [];
  const targets = [];
  const damageEffects = { preventRetaliation: new Set(), events: [] };
  const dodgeUpdates = [];
  const hitsSummary = new Map();
  const addSummary = (r, c, dealt, extra = {}) => {
    const key = `${r},${c}`;
    const entry = hitsSummary.get(key) || { r, c, dealt: 0, invisible: false };
    entry.dealt += dealt;
    entry.invisible = entry.invisible || !!extra.invisible;
    hitsSummary.set(key, entry);
  };

  const atkStats = effectiveStats(originCell, attacker, { state: n1, r: fromR, c: fromC });
  let atk = atkStats.atk || 0;
  const dynMagic = computeDynamicMagicAttack(n1, tplA);
  if (dynMagic) {
    atk = dynMagic.amount;
    logLines.push(`${tplA.name}: сила магии = ${dynMagic.amount} (число огненных полей).`);
  }

  const plusCfg2 = tplA.plusAtkIfTargetOnElement || (tplA.plus1IfTargetOnElement ? { element: tplA.plus1IfTargetOnElement, amount: 1 } : null);
  if (plusCfg2) {
    const el = normalizeElementName(plusCfg2.element);
    const amount = plusCfg2.amount;
    if (el) {
      const cellEl = normalizeElementName(n1.board?.[targetR]?.[targetC]?.element);
      if (cellEl === el) atk += amount;
    }
  }
  if (mainTarget) {
    const costBonus2 = getTargetCostBonus(n1, tplA, [ { r: targetR, c: targetC } ]);
    if (costBonus2) {
      atk += costBonus2.amount;
      logLines.push(`${tplA.name}: +${costBonus2.amount} ATK против существ с ценой призыва <= ${costBonus2.limit}`);
    }
  }

  const seenCells = new Set();
  const cells = [];
  const addCell = (rr, cc) => {
    if (!inBounds(rr, cc)) return;
    const key = `${rr},${cc}`;
    if (seenCells.has(key)) return;
    seenCells.add(key);
    cells.push({ r: rr, c: cc });
  };

  const primaryTarget = { r: targetR, c: targetC };
  const baseCells = collectMagicTargetCells(n1, tplForMagic, { r: fromR, c: fromC }, primaryTarget) || [];
  for (const cell of baseCells) { addCell(cell.r, cell.c); }

  if (tplA.magicTargetsSameElement && mainTarget) {
    const tplTarget = CARDS[mainTarget.tplId];
    const targetElement = tplTarget?.element || null;
    if (targetElement) {
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          if (rr === targetR && cc === targetC) continue;
          const cellUnit = n1.board?.[rr]?.[cc]?.unit;
          if (!cellUnit) continue;
          if (cellUnit.owner === attacker.owner) continue;
          const tplCell = CARDS[cellUnit.tplId];
          if (tplCell?.element === targetElement) {
            addCell(rr, cc);
          }
        }
      }
    }
  }

  const splash = tplA.splash || 0;
  if (splash > 0 && !tplA.targetAllEnemies && !tplA.targetAllNonElement) {
    const refR = primaryTarget?.r ?? targetR;
    const refC = primaryTarget?.c ?? targetC;
    if (typeof refR === 'number' && typeof refC === 'number') {
      const dirs = [ [-1,0], [1,0], [0,-1], [0,1] ];
      for (const [dr, dc] of dirs) {
        for (let dist = 1; dist <= splash; dist++) {
          addCell(refR + dr * dist, refC + dc * dist);
        }
      }
    }
  }

  const hpBonus2 = getTargetHpBonus(n1, tplA, cells);
  if (hpBonus2) {
    atk += hpBonus2.amount;
    logLines.push(`${tplA.name}: +${hpBonus2.amount} ATK против существ с HP >= ${hpBonus2.threshold}`);
  }
  const elementBonus = getTargetElementBonus(tplA, n1, cells);
  if (elementBonus) {
    atk += elementBonus.amount;
    logLines.push(`${tplA.name}: +${elementBonus.amount} ATK против существ стихии ${elementBonus.element}`);
  }

  const randomBonus = (tplA.randomPlus2 && Math.random() < 0.5) ? 2 : 0;
  if (randomBonus) atk += randomBonus;
  const dmg = Math.max(0, atk);

  for (const cell of cells) {
    const u = n1.board?.[cell.r]?.[cell.c]?.unit;
    if (!u) continue;
    if (!allowFriendly && u.owner === attacker.owner) continue;
    const tplB = CARDS[u.tplId];
    const invisible = hasInvisibility(n1, cell.r, cell.c, { unit: u, tpl: tplB });
    const before = u.currentHP ?? tplB.hp;
    let dealt = 0;
    if (!invisible) {
      dealt = dmg;
      u.currentHP = Math.max(0, before - dealt);
    }
    addSummary(cell.r, cell.c, dealt, { invisible });
    targets.push({ r: cell.r, c: cell.c, dmg: dealt });
    const after = invisible ? before : (u.currentHP ?? tplB.hp);
    const parts = [`${CARDS[attacker.tplId].name} (Magic) → ${CARDS[u.tplId].name}: ${dealt} dmg (HP ${before}→${after})`];
    if (invisible) parts.push('(невидимость)');
    logLines.push(parts.join(' '));
  }

  if (hasDoubleAttack(tplA)) {
    for (const cell of cells) {
      const u2 = n1.board?.[cell.r]?.[cell.c]?.unit;
      if (!u2) continue;
      if (!allowFriendly && u2.owner === attacker.owner) continue;
      const tplB2 = CARDS[u2.tplId];
      if ((u2.currentHP ?? tplB2.hp) <= 0) continue;
      const invisible = hasInvisibility(n1, cell.r, cell.c, { unit: u2, tpl: tplB2 });
      const before2 = u2.currentHP ?? tplB2.hp;
      let dealt2 = 0;
      if (!invisible) {
        dealt2 = dmg;
        u2.currentHP = Math.max(0, before2 - dealt2);
      }
      addSummary(cell.r, cell.c, dealt2, { invisible });
      targets.push({ r: cell.r, c: cell.c, dmg: dealt2 });
      const after2 = invisible ? before2 : (u2.currentHP ?? tplB2.hp);
      const parts = [`${CARDS[attacker.tplId].name} (Magic 2nd) → ${CARDS[u2.tplId].name}: ${dealt2} dmg (HP ${before2}→${after2})`];
      if (invisible) parts.push('(невидимость)');
      logLines.push(parts.join(' '));
    }
  }

  const interactions = collectDamageInteractions(n1, {
    attackerPos: { r: fromR, c: fromC },
    attackerUnit: attacker,
    tpl: tplA,
    hits: Array.from(hitsSummary.values()),
  });
  if (interactions) {
    const prevents = interactions.preventRetaliation;
    if (prevents instanceof Set || Array.isArray(prevents)) {
      for (const key of prevents) {
        damageEffects.preventRetaliation.add(key);
      }
    }
    if (Array.isArray(interactions.events) && interactions.events.length) {
      damageEffects.events.push(...interactions.events);
    }
  }

  const applied = applyDamageInteractionResults(n1, damageEffects);
  const attackerPosUpdate = applied?.attackerPosUpdate || null;
  if (attackerPosUpdate) {
    fromR = attackerPosUpdate.r;
    fromC = attackerPosUpdate.c;
  }
  if (Array.isArray(applied?.logLines) && applied.logLines.length) {
    logLines.push(...applied.logLines);
  }
  const interactionDeaths = Array.isArray(applied?.deaths) ? applied.deaths.slice() : [];
  const deaths = interactionDeaths.slice();
  const seenDeathKeys = new Set(deaths.map(d => (d?.uid != null)
    ? `UID:${d.uid}`
    : `POS:${d?.r},${d?.c}`));
  for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
    const cellRef = n1.board[rr][cc];
    const u = cellRef.unit;
    if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
      const deathEntry = createDeathEntry(n1, u, rr, cc) || {
        r: rr,
        c: cc,
        owner: u.owner,
        tplId: u.tplId,
        uid: u.uid ?? null,
        element: cellRef?.element || null,
      };
      const key = (deathEntry.uid != null) ? `UID:${deathEntry.uid}` : `POS:${deathEntry.r},${deathEntry.c}`;
      if (!seenDeathKeys.has(key)) {
        deaths.push(deathEntry);
        seenDeathKeys.add(key);
      }
      cellRef.unit = null;
    }
  }
  try {
    for (const d of deaths) {
      if (n1 && n1.players && n1.players[d.owner]) {
        n1.players[d.owner].mana = capMana((n1.players[d.owner].mana || 0) + 1);
      }
    }
  } catch {}
  const manaFromDeaths = applyManaGainOnDeaths(n1, deaths, { boardState: n1 });
  if (Array.isArray(manaFromDeaths?.logs) && manaFromDeaths.logs.length) {
    logLines.push(...manaFromDeaths.logs);
  }

  const manaStealEvents = applyDeathManaSteal(n1, deaths, { cause: 'MAGIC' });
  if (Array.isArray(manaStealEvents) && manaStealEvents.length) {
    for (const ev of manaStealEvents) {
      if (ev && typeof ev.log === 'string' && ev.log) {
        logLines.push(ev.log);
      }
    }
  }

  const repositionLog = applyDeathRepositionEffects(n1, deaths);
  if (Array.isArray(repositionLog?.logs) && repositionLog.logs.length) {
    logLines.push(...repositionLog.logs);
  }
  const discardEffects = applyDeathDiscardEffects(n1, deaths, { cause: 'MAGIC' });
  if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
    logLines.push(...discardEffects.logs);
  }
  const releaseEvents = releasePossessionsAfterDeaths(n1, deaths);
  if (releaseEvents.releases.length) {
    for (const rel of releaseEvents.releases) {
      const unit = n1.board?.[rel.r]?.[rel.c]?.unit;
      const tplRel = unit ? CARDS[unit.tplId] : null;
      const name = tplRel?.name || 'Существо';
      logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
    }
  }
  const continuous = refreshContinuousPossessions(n1);
  if (continuous.possessions.length) {
    for (const ev of continuous.possessions) {
      const takenUnit = n1.board?.[ev.r]?.[ev.c]?.unit;
      const tplTaken = takenUnit ? CARDS[takenUnit.tplId] : null;
      const name = tplTaken?.name || 'Существо';
      const ownerLabel = (ev.newOwner != null) ? ev.newOwner + 1 : '?';
      logLines.push(`${name}: контроль переходит к игроку ${ownerLabel}.`);
    }
  }
  if (continuous.releases.length) {
    for (const rel of continuous.releases) {
      const unit = n1.board?.[rel.r]?.[rel.c]?.unit;
      const tplRel = unit ? CARDS[unit.tplId] : null;
      const name = tplRel?.name || 'Существо';
      logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
    }
  }
  attacker.lastAttackTurn = n1.turn;
  attacker.apSpent = (attacker.apSpent || 0) + attackCostValue;
  const dodgeFinal = refreshBoardDodgeStates(n1);
  if (Array.isArray(dodgeFinal?.updated) && dodgeFinal.updated.length) {
    dodgeUpdates.push(...dodgeFinal.updated);
  }
  const combinedReleases = [...releaseEvents.releases, ...continuous.releases];
  return {
    n1,
    logLines,
    targets,
    deaths,
    releases: combinedReleases,
    possessions: continuous.possessions,
    attackerPosUpdate,
    dodgeUpdates,
    attackType,
    schemeKey,
    attackProfile: profile,
    dmg,
    manaGainEvents: Array.isArray(manaFromDeaths?.entries) ? manaFromDeaths.entries : [],
  };
}

export { computeCellBuff };
export { resolveAttackProfile, refreshBoardDodgeStates } from './abilities.js';
