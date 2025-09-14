// Pure game rules helpers (no DOM/THREE/GSAP/socket)
import { DIR_VECTORS, inBounds, attackCost, OPPOSITE_ELEMENT, capMana } from './constants.js';
import { CARDS } from './cards.js';
import { hasFirstStrike, hasInvisibility, removePossessionBySource } from './abilities.js';
import { countUnits, countUnitsByElement } from './board.js';

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
export function computeCellBuff(cellElement, unitElement) {
  if (!cellElement || !unitElement) return { atk: 0, hp: 0 };
  if (cellElement === unitElement) return { atk: 0, hp: 2 };
  if (cellElement === 'MECH') return { atk: 0, hp: 0 };
  const opp = OPPOSITE_ELEMENT[unitElement];
  if (cellElement === opp) return { atk: 0, hp: -2 };
  return { atk: 0, hp: 0 };
}

export function effectiveStats(cell, unit) {
  const tpl = unit ? CARDS[unit.tplId] : null;
  const buff = computeCellBuff(cell?.element, tpl?.element);
  const tempAtk = typeof unit?.tempAtkBuff === 'number' ? unit.tempAtkBuff : 0;
  const atk = Math.max(0, (tpl?.atk || 0) + buff.atk + tempAtk);
  const hp = Math.max(0, (tpl?.hp || 0) + buff.hp);
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
    const isBack = (nr + bdr === r && nc + bdc === c);
    const dirAbsFromB = (() => {
      if (r === nr - 1 && c === nc) return 'N';
      if (r === nr + 1 && c === nc) return 'S';
      if (r === nr && c === nc - 1) return 'W';
      return 'E';
    })();
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
  if (tplA.fortress) return null;
  const baseStats = effectiveStats(base.board[r][c], attacker);
  let atk = baseStats.atk;
  let logLines = [];

  const hitsRaw = computeHits(base, r, c, opts);
  if (!hitsRaw.length) return { empty: true };

  if (tplA.dynamicAtk === 'OTHERS_ON_BOARD') {
    const others = countUnits(base) - 1;
    atk += others;
    logLines.push(`${tplA.name}: атака увеличена на ${others}`);
  }
  if (tplA.dynamicAtk === 'FIRE_CREATURES') {
    const others = countUnitsByElement(base, 'FIRE') - 1;
    atk += others;
    logLines.push(`${tplA.name}: атака увеличена на ${others}`);
  }
  if (tplA.randomPlus2 && Math.random() < 0.5) {
    atk += 2;
    logLines.push(`${tplA.name}: случайный бонус +2 ATK`);
  }
  if (tplA.plus2IfWaterTarget) {
    const water = hitsRaw.some(h => base.board?.[h.r]?.[h.c]?.element === 'WATER');
    if (water) { atk += 2; logLines.push(`${tplA.name}: +2 атаки по цели на воде`); }
  }
  if (tplA.plus1IfTargetOnElement) {
    const elem = tplA.plus1IfTargetOnElement;
    const ok = hitsRaw.some(h => base.board?.[h.r]?.[h.c]?.element === elem);
    if (ok) { atk += 1; logLines.push(`${tplA.name}: +1 атаки против цели на поле ${elem}`); }
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
  if (tplA.doubleAttack) {
    for (const h of hitsRaw) { h.dmg = Math.max(0, h.dmg * 2); }
    logLines.push(`${tplA.name}: двойная атака`);
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
    const cellEl = cell?.element;
    const invis = hasInvisibility(base, h.r, h.c, B, tplB);
    const dodge = !isMagic && !invis && (tplB.perfectDodge || (tplB.perfectDodgeOnFire && cellEl === 'FIRE') || (tplB.dodge50 && Math.random() < 0.5));
    const dealt = (invis || dodge) ? 0 : h.dmg;
    return { ...h, dealt, dodge, invis };
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
        if (h.invis) parts.push('(invisible)');
        logLines.push(parts.join(' '));
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
        deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId, uid: u.uid });
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
      if (tplD?.onDeathHealAll) {
        for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
          const u2 = nFinal.board?.[rr]?.[cc]?.unit; if (!u2) continue;
          if (u2.owner === d.owner) {
            const tpl2 = CARDS[u2.tplId];
            const before = u2.currentHP ?? tpl2.hp;
            u2.currentHP = Math.min(tpl2.hp, before + tplD.onDeathHealAll);
          }
        }
        logLines.push(`${tplD.name}: союзники исцелены на ${tplD.onDeathHealAll}`);
      }
      removePossessionBySource(nFinal, d.uid);
    }

    if (A) {
      A.lastAttackTurn = nFinal.turn;
      const cellEl = nFinal.board?.[r]?.[c]?.element;
      A.apSpent = (A.apSpent || 0) + attackCost(tplA, cellEl);
    }

    const targets = step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 }));
    return { n1: nFinal, logLines, targets, deaths, retaliators: ret.retaliators };
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
  const allowFriendly = !!tplA.friendlyFire;
  const mainTarget = n1.board?.[tr]?.[tc]?.unit;
  if (!allowFriendly && (!mainTarget || mainTarget.owner === attacker.owner)) return null;

  const atkStats = effectiveStats(n1.board[fr][fc], attacker);
  let dmg = atkStats.atk || 0;
  if (tplA.dynamicMagicAtk === 'FIRE_FIELDS') {
    let cnt = 0; for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) if (n1.board?.[rr]?.[cc]?.element === 'FIRE') cnt++;
    dmg = cnt;
  }
  if (tplA.randomPlus2 && Math.random() < 0.5) dmg += 2;
  dmg = Math.max(0, dmg);

  const cells = [{ r: tr, c: tc }];
  const splash = tplA.splash || (tplA.magicAttackArea ? 1 : 0);
  if (splash > 0) {
    const dirs = [ [-1,0], [1,0], [0,-1], [0,1] ];
    for (const [dr, dc] of dirs) {
      for (let dist = 1; dist <= splash; dist++) {
        const rr = tr + dr * dist;
        const cc = tc + dc * dist;
        if (inBounds(rr, cc)) cells.push({ r: rr, c: cc });
      }
    }
  }

  const targets = [];
  const logLines = [];
  for (const cell of cells) {
    const u = n1.board?.[cell.r]?.[cell.c]?.unit;
    if (!u) continue;
    if (!allowFriendly && u.owner === attacker.owner) continue;
    const tplT = CARDS[u.tplId];
    if (hasInvisibility(n1, cell.r, cell.c, u, tplT)) {
      logLines.push(`${CARDS[attacker.tplId].name} (Magic) → ${CARDS[u.tplId].name}: 0 dmg (invisible)`);
      continue;
    }
    const before = u.currentHP ?? tplT.hp;
    u.currentHP = Math.max(0, before - dmg);
    targets.push({ r: cell.r, c: cell.c, dmg });
    logLines.push(`${CARDS[attacker.tplId].name} (Magic) → ${CARDS[u.tplId].name}: ${dmg} dmg (HP ${before}→${u.currentHP})`);
  }

  const deaths = [];
  for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
    const u = n1.board[rr][cc].unit;
    if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
      deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId, uid: u.uid });
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
  for (const d of deaths) {
    const tplD = CARDS[d.tplId];
    if (tplD?.onDeathHealAll) {
      for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
        const u2 = n1.board?.[rr]?.[cc]?.unit; if (!u2) continue;
        if (u2.owner === d.owner) {
          const tpl2 = CARDS[u2.tplId];
          const before = u2.currentHP ?? tpl2.hp;
          u2.currentHP = Math.min(tpl2.hp, before + tplD.onDeathHealAll);
        }
      }
      logLines.push(`${tplD.name}: союзники исцелены на ${tplD.onDeathHealAll}`);
    }
    removePossessionBySource(n1, d.uid);
  }
  attacker.lastAttackTurn = n1.turn;
  const cellEl = n1.board?.[fr]?.[fc]?.element;
  attacker.apSpent = (attacker.apSpent || 0) + attackCost(tplA, cellEl);
  return { n1, logLines, targets, deaths };
}

// Массовая магическая атака по всем врагам не на указанном элементе
export function magicAttackAll(state, fr, fc, avoidElement) {
  const n1 = JSON.parse(JSON.stringify(state));
  const attacker = n1.board?.[fr]?.[fc]?.unit;
  if (!attacker) return null;
  if (attacker.lastAttackTurn === n1.turn) return null;
  const tplA = CARDS[attacker.tplId];
  const targetsCells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cell = n1.board?.[r]?.[c];
    const u = cell?.unit;
    if (!u) continue;
    if (cell.element === avoidElement) continue;
    if (u.owner === attacker.owner) continue;
    targetsCells.push({ r, c });
  }
  if (!targetsCells.length) return null;
  const atkStats = effectiveStats(n1.board[fr][fc], attacker);
  let dmg = atkStats.atk || 0;
  if (tplA.randomPlus2 && Math.random() < 0.5) dmg += 2;
  const logLines = [];
  const targets = [];
  for (const cell of targetsCells) {
    const u = n1.board[cell.r][cell.c].unit;
    const tplT = CARDS[u.tplId];
    if (hasInvisibility(n1, cell.r, cell.c, u, tplT)) {
      logLines.push(`${tplA.name} (Magic) → ${tplT.name}: 0 dmg (invisible)`);
      continue;
    }
    const before = u.currentHP ?? tplT.hp;
    u.currentHP = Math.max(0, before - dmg);
    targets.push({ r: cell.r, c: cell.c, dmg });
    logLines.push(`${tplA.name} (Magic) → ${tplT.name}: ${dmg} dmg (HP ${before}→${u.currentHP})`);
  }
  const deaths = [];
  for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
    const u = n1.board[rr][cc].unit;
    if (u && (u.currentHP ?? CARDS[u.tplId].hp) <= 0) {
      deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId, uid: u.uid });
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
  for (const d of deaths) {
    const tplD = CARDS[d.tplId];
    if (tplD?.onDeathHealAll) {
      for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
        const u2 = n1.board?.[rr]?.[cc]?.unit; if (!u2) continue;
        if (u2.owner === d.owner) {
          const tpl2 = CARDS[u2.tplId];
          const before = u2.currentHP ?? tpl2.hp;
          u2.currentHP = Math.min(tpl2.hp, before + tplD.onDeathHealAll);
        }
      }
      logLines.push(`${tplD.name}: союзники исцелены на ${tplD.onDeathHealAll}`);
    }
    removePossessionBySource(n1, d.uid);
  }
  attacker.lastAttackTurn = n1.turn;
  const cellEl = n1.board?.[fr]?.[fc]?.element;
  attacker.apSpent = (attacker.apSpent || 0) + attackCost(tplA, cellEl);
  return { n1, logLines, targets, deaths };
}
