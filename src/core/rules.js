// Pure game rules helpers (no DOM/THREE/GSAP/socket)
import { DIR_VECTORS, inBounds, attackCost, OPPOSITE_ELEMENT, capMana } from './constants.js';
import { CARDS } from './cards.js';

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
  const ORDER = ['N','E','S','W'];
  const fi = ORDER.indexOf(facing);
  const di = ORDER.indexOf(dir);
  return ORDER[(fi + di) % 4];
}

// Проверяем, может ли юнит ударить клетку (используется для контратаки)
function unitCanHit(state, fr, fc, tr, tc) {
  const unit = state.board?.[fr]?.[fc]?.unit;
  if (!unit) return false;
  const tpl = CARDS[unit.tplId];
  const attacks = tpl.attacks || [];
  for (const atk of attacks) {
    const absDir = rotateDir(unit.facing, atk.dir);
    const [dr, dc] = DIR_VECTORS[absDir];
    const ranges = Array.isArray(atk.range) ? atk.range : [atk.range];
    for (const step of ranges) {
      const nr = fr + dr * step, nc = fc + dc * step;
      if (!inBounds(nr, nc)) break;
      if (nr === tr && nc === tc) {
        const flying = (tpl.keywords || []).includes('FLYING');
        const targetTplId = state.board?.[tr]?.[tc]?.unit?.tplId;
        if (!flying && hasAdjacentGuard(state, tr, tc) && !(CARDS[targetTplId]?.keywords || []).includes('GUARD')) {
          return false;
        }
        return true;
      }
      if (state.board[nr][nc]?.unit) break;
    }
  }
  return false;
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
  const attacks = tplA.attacks || [];
  const select = tplA.attackSelect || 'ALL';
  const chosen = opts.chosenIndex ?? 0;
  const rangeChoice = opts.rangeChoice || {};
  const { atk } = effectiveStats(state.board[r][c], attacker);
  const hits = [];

  attacks.forEach((atkDef, idx) => {
    if (select === 'ONE' && idx !== chosen) return;
    const absDir = rotateDir(attacker.facing, atkDef.dir);
    const [dr, dc] = DIR_VECTORS[absDir];
    const ranges = Array.isArray(atkDef.range) ? atkDef.range : [atkDef.range];
    const multi = atkDef.multi !== false; // по умолчанию бьём все клетки по порядку
    const steps = multi ? ranges : [rangeChoice[idx] || ranges[0]];
    for (const step of steps) {
      const nr = r + dr * step, nc = c + dc * step;
      if (!inBounds(nr, nc)) continue;
      const B = state.board[nr][nc]?.unit;
      if (!B) continue;
      if (B.owner === attacker.owner) break;
      const aFlying = (tplA.keywords || []).includes('FLYING');
      if (!aFlying && hasAdjacentGuard(state, nr, nc) && !(CARDS[B.tplId].keywords || []).includes('GUARD')) {
        break;
      }
      const backDir = { N:'S', S:'N', E:'W', W:'E' }[B.facing];
      const [bdr, bdc] = DIR_VECTORS[backDir] || [0,0];
      const isBack = (nr + bdr === r && nc + bdc === c);
      const dirAbs = (r === nr - 1 && c === nc) ? 'N' : (r === nr + 1 && c === nc) ? 'S' : (r === nr && c === nc - 1) ? 'W' : 'E';
      const ORDER = ['N','E','S','W'];
      const absIdx = ORDER.indexOf(dirAbs);
      const faceIdx = ORDER.indexOf(B.facing);
      const relIdx = (absIdx - faceIdx + 4) % 4;
      const dirRel = ORDER[relIdx];
      const blind = CARDS[B.tplId].blindspots || ['S'];
      const inBlind = blind.includes(dirRel);
      const extraTotal = isBack ? 1 : (inBlind ? 1 : 0);
      const dmg = Math.max(0, atk + extraTotal);
      hits.push({ r: nr, c: nc, dmg, backstab: isBack });
      break;
    }
  });

  return hits;
}


// New staged attack that exposes step1/step2/finish for UI animation
export function stagedAttack(state, r, c) {
  const base = JSON.parse(JSON.stringify(state));
  const attacker = base.board?.[r]?.[c]?.unit;
  if (!attacker) return null;

  const tplA = CARDS[attacker.tplId];
  const hitsRaw = computeHits(base, r, c);
  if (!hitsRaw.length) return { empty: true };

  // Precompute damages once to keep behavior deterministic across calls
  const step1Damages = hitsRaw.map(h => {
    const cell = base.board?.[h.r]?.[h.c];
    const B = cell?.unit;
    if (!B) return { ...h, dealt: 0 };
    const isMagic = tplA.attackType === 'MAGIC';
    const dodge = CARDS[B.tplId].dodge50 && !isMagic && Math.random() < 0.5;
    const dealt = dodge ? 0 : h.dmg;
    return { ...h, dealt, dodge };
  });

  const logLines = [];
  const n1 = JSON.parse(JSON.stringify(base));
  let step1Done = false;

  function doStep1() {
    if (step1Done) return;
    for (const h of step1Damages) {
      const cell = n1.board?.[h.r]?.[h.c];
      const B = cell?.unit; if (!B) continue;
      const before = B.currentHP ?? B.hp;
      B.currentHP = Math.max(0, before - (h.dealt || 0));
      const afterHP = B.currentHP;
      const nameA = CARDS[attacker.tplId]?.name || 'Attacker';
      const nameB = CARDS[B.tplId]?.name || 'Target';
      const parts = [`${nameA} → ${nameB}: ${h.dealt || 0} dmg (HP ${before}→${afterHP})`];
      if (h.backstab) parts.push('(+1 backstab)');
      if (h.dodge) parts.push('(dodge)');
      logLines.push(parts.join(' '));
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
      const alive = (B.currentHP ?? B.hp) > 0;
      if (!alive) continue;
      if (unitCanHit(n1, h.r, h.c, r, c)) {
        const { atk: batk } = effectiveStats(n1.board[h.r][h.c], B);
        totalRetaliation += Math.max(0, batk);
        retaliators.push({ r: h.r, c: h.c });
      }
    }
    const preventRetaliation = tplA.attackType === 'MAGIC';
    const total = preventRetaliation ? 0 : totalRetaliation;
    return { total, retaliators };
  }

  function finish() {
    ensureStep1();
    const nFinal = JSON.parse(JSON.stringify(n1));
    const ret = step2();

    const A = nFinal.board?.[r]?.[c]?.unit;
    if (A && (ret.total || 0) > 0) {
      const before = A.currentHP ?? A.hp;
      A.currentHP = Math.max(0, before - (ret.total || 0));
      logLines.push(`Retaliation to ${CARDS[A.tplId]?.name || 'Attacker'}: ${ret.total || 0} (HP ${before}→${A.currentHP})`);
    }

    const deaths = [];
    for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
      const u = nFinal.board?.[rr]?.[cc]?.unit;
      if (u && (u.currentHP ?? u.hp) <= 0) {
        deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId });
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

    if (A) {
      A.lastAttackTurn = nFinal.turn;
      A.apSpent = (A.apSpent || 0) + attackCost(tplA);
    }

    const targets = step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 }));
    return { n1: nFinal, logLines, targets, deaths, retaliators: ret.retaliators };
  }

  return {
    step1: doStep1,
    step2,
    finish,
    get n1() { ensureStep1(); return n1; },
    get targetsPreview() { return step1Damages.map(h => ({ r: h.r, c: h.c, dmg: h.dealt || 0 })); },
  };
}

export function magicAttack(state, fr, fc, tr, tc) {
  const n1 = JSON.parse(JSON.stringify(state));
  const attacker = n1.board?.[fr]?.[fc]?.unit; const target = n1.board?.[tr]?.[tc]?.unit;
  if (!attacker || !target || target.owner === attacker.owner) return null;
  const tplA = CARDS[attacker.tplId];
  const atkStats = effectiveStats(n1.board[fr][fc], attacker);
  const dmg = Math.max(0, (atkStats.atk || 0) + (tplA.randomPlus2 && Math.random() < 0.5 ? 2 : 0));
  const before = target.currentHP ?? target.hp;
  target.currentHP = Math.max(0, before - dmg);
  const afterHP = target.currentHP;
  const logLines = [`${CARDS[attacker.tplId].name} (Magic) → ${CARDS[target.tplId].name}: ${dmg} dmg (HP ${before}→${afterHP})`];
  const deaths = [];
  for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
    const u = n1.board[rr][cc].unit; if (u && (u.currentHP ?? u.hp) <= 0) { deaths.push({ r: rr, c: cc, owner: u.owner, tplId: u.tplId }); n1.board[rr][cc].unit = null; }
  }
  try {
    for (const d of deaths) {
      if (n1 && n1.players && n1.players[d.owner]) {
        n1.players[d.owner].mana = Math.min(10, (n1.players[d.owner].mana || 0) + 1);
      }
    }
  } catch {}
  attacker.lastAttackTurn = n1.turn;
  attacker.apSpent = (attacker.apSpent || 0) + attackCost(tplA);
  return { n1, logLines, dmg, deaths };
}
