// Pure game rules helpers (no DOM/THREE/GSAP/socket)
import { DIR_VECTORS, inBounds, attackCost, capMana } from './constants.js';
import { CARDS } from './cards.js';
import {
  hasFirstStrike,
  hasDoubleAttack,
  canAttack,
  getTargetElementBonus,
  collectMagicTargetCells,
  computeDynamicMagicAttack,
  releasePossessionsAfterDeaths,
  hasPerfectDodge,
  hasInvisibility,
  collectDamageInteractions,
  applyDamageInteractionResults,
} from './abilities.js';
import { countUnits } from './board.js';
import { computeCellBuff } from './fieldEffects.js';

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
function attackCellsForTpl(tpl, facing, opts = {}) {
  const res = [];
  const attacks = tpl.attacks || [];
  const { chosenDir, rangeChoices, union } = opts;
  for (const a of attacks) {
    if (!union && tpl.chooseDir) {
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
    for (const r of used) {
      res.push({ dirAbs, range: r, dirRel: a.dir });
    }
  }
  return res;
}

// Compute effective stats (handles temp buffs if present on cell)
export function effectiveStats(cell, unit) {
  const tpl = unit ? CARDS[unit.tplId] : null;
  const buff = computeCellBuff(cell?.element, tpl?.element);
  const tempAtk = typeof unit?.tempAtkBuff === 'number' ? unit.tempAtkBuff : 0;
  const atk = Math.max(0, (tpl?.atk || 0) + buff.atk + tempAtk);
  const extra = typeof unit?.bonusHP === 'number' ? unit.bonusHP : 0;
  const hp = Math.max(0, (tpl?.hp || 0) + buff.hp + extra);
  return { atk, hp };
}

export function computeHits(state, r, c, opts = {}) {
  const attacker = state.board?.[r]?.[c]?.unit;
  if (!attacker) return [];
  const tplA = CARDS[attacker.tplId];
  // tplA.friendlyFire — может ли атака задевать союзников
  const cells = attackCellsForTpl(tplA, attacker.facing, opts);
  const { atk } = effectiveStats(state.board[r][c], attacker);
  const hits = [];
  const aFlying = (tplA.keywords || []).includes('FLYING');
  const allowPierce = tplA.pierce;
  const allowFriendly = !!tplA.friendlyFire; // может ли существо задевать союзников
  for (const cell of cells) {
    const [dr, dc] = DIR_VECTORS[cell.dirAbs];
    const nr = r + dr * cell.range;
    const nc = c + dc * cell.range;
    if (!inBounds(nr, nc)) continue;

    // проверяем препятствия
    if (!allowPierce) {
      let blocked = false;
      for (let step = 1; step < cell.range; step++) {
        const tr = r + dr * step;
        const tc = c + dc * step;
        const uMid = state.board?.[tr]?.[tc]?.unit;
        if (uMid && (uMid.currentHP ?? CARDS[uMid.tplId]?.hp) > 0) { blocked = true; break; }
      }
      if (blocked) continue;
    }

    if (opts.target && (opts.target.r !== nr || opts.target.c !== nc)) continue;

    let B = state.board?.[nr]?.[nc]?.unit;
    if (B && (B.currentHP ?? CARDS[B.tplId]?.hp) <= 0) B = null;
    if (!B) {
      if (opts.includeEmpty) hits.push({ r: nr, c: nc, dmg: 0 });
      continue;
    }
    if (B.owner === attacker.owner && !allowFriendly) {
      if (opts.includeEmpty) hits.push({ r: nr, c: nc, dmg: 0 });
      continue; // по умолчанию союзников не бьём
    }
    if (B.owner !== attacker.owner &&
        !aFlying && hasAdjacentGuard(state, nr, nc) && !(CARDS[B.tplId].keywords || []).includes('GUARD')) {
      continue; // охрана работает только против врагов
    }
    const backDir = { N: 'S', S: 'N', E: 'W', W: 'E' }[B.facing];
    const [bdr, bdc] = DIR_VECTORS[backDir] || [0, 0];
    const forcedBack = !!tplA.backAttack;
    let isBack = (!forcedBack && (nr + bdr === r && nc + bdc === c));
    let dirAbsFromB = (() => {
      if (r === nr - 1 && c === nc) return 'N';
      if (r === nr + 1 && c === nc) return 'S';
      if (r === nr && c === nc - 1) return 'W';
      return 'E';
    })();
    if (forcedBack) {
      // Ниндзя с backAttack всегда считаются атакующими со спины,
      // чтобы корректно добавлять бонус урона и помечать удар как backstab.
      isBack = true;
      if (backDir) {
        dirAbsFromB = backDir;
      }
    }
    const ORDER = ['N', 'E', 'S', 'W'];
    const absIdx = ORDER.indexOf(dirAbsFromB);
    const faceIdx = ORDER.indexOf(B.facing);
    const relIdx = (absIdx - faceIdx + 4) % 4;
    const dirRel = ORDER[relIdx];
    const blind = CARDS[B.tplId].blindspots || ['S'];
    const inBlind = blind.includes(dirRel);
    const extraTotal = isBack ? 1 : (inBlind ? 1 : 0);
    const dmg = Math.max(0, atk + extraTotal);
    hits.push({ r: nr, c: nc, dmg, backstab: isBack });
  }
  return hits;
}

// New staged attack that exposes step1/step2/finish for UI animation
// Постановочный (staged) бой с поддержкой выбора направления/дистанции
export function stagedAttack(state, r, c, opts = {}) {
  const base = JSON.parse(JSON.stringify(state));
  const attacker = base.board?.[r]?.[c]?.unit;
  if (!attacker) return null;
  // не позволяем атаковать более одного раза за ход
  if (attacker.lastAttackTurn === base.turn) return null;
  const tplA = CARDS[attacker.tplId];
  if (!canAttack(tplA)) return null;
  
  const baseStats = effectiveStats(base.board[r][c], attacker);
  let atk = baseStats.atk;
  let logLines = [];
  const damageEffects = { preventRetaliation: new Set(), events: [] };

  const hitsRaw = computeHits(base, r, c, opts);
  if (!hitsRaw.length) return { empty: true };

  if (tplA.dynamicAtk === 'OTHERS_ON_BOARD') {
    const others = countUnits(base) - 1;
    atk += others;
    logLines.push(`${tplA.name}: атака увеличена на ${others}`);
  }
  if (tplA.dynamicAtk === 'FIRE_CREATURES') {
    let cnt = 0;
    for (let rr = 0; rr < 3; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        if (rr === r && cc === c) continue;
        const u = base.board[rr][cc]?.unit;
        if (u && CARDS[u.tplId]?.element === 'FIRE') cnt++;
      }
    }
    atk += cnt;
    logLines.push(`${tplA.name}: атака увеличена на ${cnt}`);
  }
  const targetBonus = getTargetElementBonus(tplA, base, hitsRaw);
  const plusCfg = tplA.plusAtkIfTargetOnElement || (tplA.plus1IfTargetOnElement ? { element: tplA.plus1IfTargetOnElement, amount: 1 } : null);
  if (plusCfg) {
    const { element: el, amount } = plusCfg;
    const has = hitsRaw.some(h => base.board?.[h.r]?.[h.c]?.element === el);
    if (has) {
      atk += amount;
      logLines.push(`${tplA.name}: +${amount} ATK по целям на поле ${el}`);
    }
  }
  if (targetBonus) {
    atk += targetBonus.amount;
    logLines.push(`${tplA.name}: +${targetBonus.amount} ATK против существ стихии ${targetBonus.element}`);
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
    const B = base.board?.[h.r]?.[h.c]?.unit;
    if (!B) continue;
    const tplB = CARDS[B.tplId];
    if (!attackerQuick && hasFirstStrike(tplB)) {
      const hitsB = computeHits(base, h.r, h.c, { target: { r, c }, union: true });
      if (hitsB.length) {
        const { atk: batk } = effectiveStats(base.board[h.r][h.c], B);
        const dmg = Math.max(0, batk);
        quickRetaliation += dmg;
        quickSources.push(CARDS[B.tplId].name);
        quickRetaliators.push({ r: h.r, c: h.c, dmg });
      }
    }
  }

  const step1Damages = hitsRaw.map(h => {
    const cell = base.board?.[h.r]?.[h.c];
    const B = cell?.unit;
    if (!B) return { ...h, dealt: 0 };
    const isMagic = tplA.attackType === 'MAGIC';
    const tplB = CARDS[B.tplId];
    const invisible = hasInvisibility(base, h.r, h.c, { unit: B, tpl: tplB });
    const dodge = !isMagic && !invisible && (
      hasPerfectDodge(base, h.r, h.c, { unit: B, tpl: tplB }) || (tplB.dodge50 && Math.random() < 0.5)
    );
    const dealt = (invisible || dodge) ? 0 : h.dmg;
    return { ...h, dealt, dodge, invisible };
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
        hits: step1Damages.map(h => ({ r: h.r, c: h.c, dealt: h.dealt || 0 })),
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
    step1Done = true;
  }

  function ensureStep1() { if (!step1Done) doStep1(); }

  function step2() {
    ensureStep1();
    let totalRetaliation = 0;
    const retaliators = [];
    for (const h of step1Damages) {
      const preventKey = `${h.r},${h.c}`;
      if (damageEffects.preventRetaliation.has(preventKey)) continue;
      const B = n1.board?.[h.r]?.[h.c]?.unit;
      if (!B) continue;
      const tplB = CARDS[B.tplId];
      const alive = (B.currentHP ?? B.hp) > 0;
      if (!alive) continue;
      // быстрота защитника уже сработала на stepQuick, если атакующий не был быстрым
      if (!attackerQuick && hasFirstStrike(tplB)) continue;
      const hitsB = computeHits(n1, h.r, h.c, { target: { r, c }, union: true });
      if (hitsB.length) {
        const { atk: batk } = effectiveStats(n1.board[h.r][h.c], B);
        totalRetaliation += Math.max(0, batk);
        retaliators.push({ r: h.r, c: h.c });
      }
    }
    const preventRetaliation = tplA.attackType === 'MAGIC' || (tplA.avoidRetaliation50 && Math.random() < 0.5);
    const total = preventRetaliation ? 0 : totalRetaliation;
    return { total, retaliators };
  }

  function finish() {
    ensureStep1();
    const nFinal = JSON.parse(JSON.stringify(n1));
    const ret = step2();

    const applied = applyDamageInteractionResults(nFinal, damageEffects);
    if (applied?.attackerPosUpdate) {
      r = applied.attackerPosUpdate.r;
      c = applied.attackerPosUpdate.c;
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

    const deaths = [];
    for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
      const u = nFinal.board?.[rr]?.[cc]?.unit;
      if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
        deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId, uid: u.uid ?? null });
        nFinal.board[rr][cc].unit = null;
      }
    }

    try {
      for (const d of deaths) {
        if (nFinal && nFinal.players && nFinal.players[d.owner]) {
          nFinal.players[d.owner].mana = capMana((nFinal.players[d.owner].mana || 0) + 1);
        }
      }
    } catch {}

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

    const releaseEvents = releasePossessionsAfterDeaths(nFinal, deaths);
    if (releaseEvents.releases.length) {
      for (const rel of releaseEvents.releases) {
        const unit = nFinal.board?.[rel.r]?.[rel.c]?.unit;
        const tplRel = unit ? CARDS[unit.tplId] : null;
        const name = tplRel?.name || 'Существо';
        logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
      }
    }

    if (A) {
      A.lastAttackTurn = nFinal.turn;
      const cellEl = nFinal.board?.[r]?.[c]?.element;
      A.apSpent = (A.apSpent || 0) + attackCost(tplA, cellEl);
    }

    const targets = step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 }));
    return { n1: nFinal, logLines, targets, deaths, retaliators: ret.retaliators, releases: releaseEvents.releases };
  }

  return {
    stepQuick,
    step1: doStep1,
    step2,
    finish,
    quickRetaliation,
    quickRetaliators,
    attackerQuick,
    get nQuick() { stepQuick(); return n1; },
    get n1() { ensureStep1(); return n1; },
    get targetsPreview() { return step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 })); },
  };
}

export function magicAttack(state, fr, fc, tr, tc) {
  const n1 = JSON.parse(JSON.stringify(state));
  const attacker = n1.board?.[fr]?.[fc]?.unit;
  if (!attacker) return null;
  // не позволяем магам бить дважды в одном ходу
  if (attacker.lastAttackTurn === n1.turn) return null;
  const tplA = CARDS[attacker.tplId];
  if (!canAttack(tplA)) return null;
  const allowFriendly = !!tplA.friendlyFire;
  const mainTarget = n1.board?.[tr]?.[tc]?.unit;
  if (!allowFriendly && (!mainTarget || mainTarget.owner === attacker.owner)) return null;

  const logLines = [];
  const targets = [];
  const damageEffects = { preventRetaliation: new Set(), events: [] };
  const hitsSummary = new Map();
  const addSummary = (r, c, dealt, extra = {}) => {
    const key = `${r},${c}`;
    const entry = hitsSummary.get(key) || { r, c, dealt: 0, invisible: false };
    entry.dealt += dealt;
    entry.invisible = entry.invisible || !!extra.invisible;
    hitsSummary.set(key, entry);
  };

  const atkStats = effectiveStats(n1.board[fr][fc], attacker);
  let atk = atkStats.atk || 0;
  const dynMagic = computeDynamicMagicAttack(n1, tplA);
  if (dynMagic) {
    atk = dynMagic.amount;
    logLines.push(`${tplA.name}: сила магии = ${dynMagic.amount} (число огненных полей).`);
  }

  const plusCfg2 = tplA.plusAtkIfTargetOnElement || (tplA.plus1IfTargetOnElement ? { element: tplA.plus1IfTargetOnElement, amount: 1 } : null);
  if (plusCfg2) {
    const { element: el, amount } = plusCfg2;
    const cellEl = n1.board?.[tr]?.[tc]?.element;
    if (cellEl === el) atk += amount;
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

  const primaryTarget = (typeof tr === 'number' && typeof tc === 'number')
    ? { r: tr, c: tc }
    : null;
  const baseCells = collectMagicTargetCells(n1, tplA, { r: fr, c: fc }, primaryTarget) || [];
  for (const cell of baseCells) { addCell(cell.r, cell.c); }

  const splash = tplA.splash || 0;
  if (splash > 0 && !tplA.targetAllEnemies && !tplA.targetAllNonElement) {
    const refR = (primaryTarget && typeof primaryTarget.r === 'number') ? primaryTarget.r : tr;
    const refC = (primaryTarget && typeof primaryTarget.c === 'number') ? primaryTarget.c : tc;
    if (typeof refR === 'number' && typeof refC === 'number') {
      const dirs = [ [-1,0], [1,0], [0,-1], [0,1] ];
      for (const [dr, dc] of dirs) {
        for (let dist = 1; dist <= splash; dist++) {
          addCell(refR + dr * dist, refC + dc * dist);
        }
      }
    }
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
      dealt = Math.max(0, dmg);
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
        dealt2 = Math.max(0, dmg);
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
    attackerPos: { r: fr, c: fc },
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

  const deaths = [];
  for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
    const u = n1.board[rr][cc].unit;
    if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
      deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId, uid: u.uid ?? null });
      n1.board[rr][cc].unit = null;
    }
  }
  try {
    for (const d of deaths) {
      if (n1 && n1.players && n1.players[d.owner]) {
        n1.players[d.owner].mana = capMana((n1.players[d.owner].mana || 0) + 1);
      }
    }
  } catch {}
  const releaseEvents = releasePossessionsAfterDeaths(n1, deaths);
  if (releaseEvents.releases.length) {
    for (const rel of releaseEvents.releases) {
      const unit = n1.board?.[rel.r]?.[rel.c]?.unit;
      const tplRel = unit ? CARDS[unit.tplId] : null;
      const name = tplRel?.name || 'Существо';
      logLines.push(`${name}: контроль возвращается к игроку ${rel.owner + 1}.`);
    }
  }
  const applied = applyDamageInteractionResults(n1, damageEffects);
  if (applied?.attackerPosUpdate) {
    fr = applied.attackerPosUpdate.r;
    fc = applied.attackerPosUpdate.c;
  }
  if (Array.isArray(applied?.logLines) && applied.logLines.length) {
    logLines.push(...applied.logLines);
  }
  attacker.lastAttackTurn = n1.turn;
  const cellEl = n1.board?.[fr]?.[fc]?.element;
  attacker.apSpent = (attacker.apSpent || 0) + attackCost(tplA, cellEl);
  return { n1, logLines, targets, deaths, releases: releaseEvents.releases };
}

export { computeCellBuff };
