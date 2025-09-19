// Модуль для вычисления дополнительных источников способности dodge
// Позволяет повторно использовать логику как в браузере, так и при переносе в другие движки
import { CARDS } from '../cards.js';
import { getDodgeConfig, ensureDodgeState } from './dodge.js';

const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function inBounds(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function normalizeAttempts(value) {
  if (value == null) return 1;
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(0, Math.floor(num));
}

function normalizeDodgeGain(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { element: raw.toUpperCase(), attempts: 1 };
  }
  if (typeof raw === 'object') {
    const element = raw.element || raw.field || raw.type;
    const attempts = normalizeAttempts(raw.attempts || raw.limit || raw.count);
    const chance = (typeof raw.chance === 'number') ? raw.chance : null;
    const includeSelf = raw.includeSelf !== false;
    return {
      element: element ? String(element).toUpperCase() : null,
      attempts,
      chance,
      includeSelf,
    };
  }
  return null;
}

function normalizeAdjacentGrant(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { attempts: normalizeAttempts(raw) };
  }
  if (typeof raw === 'object') {
    return {
      attempts: normalizeAttempts(raw.attempts || raw.count),
      chance: (typeof raw.chance === 'number') ? raw.chance : null,
    };
  }
  return { attempts: 1 };
}

function normalizeEnemyGain(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return { attemptsPerEnemy: Math.max(0, Math.floor(raw)) };
  }
  if (typeof raw === 'object') {
    const attempts = raw.attemptsPerEnemy || raw.perEnemy || raw.amount || 1;
    return { attemptsPerEnemy: Math.max(0, Math.floor(attempts)) };
  }
  return { attemptsPerEnemy: 1 };
}

function addContribution(map, r, c, payload) {
  const key = `${r},${c}`;
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(payload);
}

export function refreshBoardDodgeStates(state) {
  if (!state?.board) return { updated: [] };
  const contributions = new Map();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board[r][c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) continue;

      const selfGain = normalizeDodgeGain(tpl.gainDodgeOnElement || tpl.gainDodgeAttemptOnElement);
      if (selfGain && selfGain.element) {
        if (cell.element === selfGain.element) {
          addContribution(contributions, r, c, {
            attempts: selfGain.attempts,
            chance: selfGain.chance,
          });
        }
      }

      const auraCfg = normalizeDodgeGain(tpl.auraGrantDodgeOnElement);
      if (auraCfg && auraCfg.element) {
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            if (!auraCfg.includeSelf && rr === r && cc === c) continue;
            const target = state.board?.[rr]?.[cc]?.unit;
            if (!target) continue;
            if (target.owner !== unit.owner) continue;
            if (state.board[rr][cc]?.element === auraCfg.element) {
              addContribution(contributions, rr, cc, {
                attempts: auraCfg.attempts,
                chance: auraCfg.chance,
              });
            }
          }
        }
      }

      const adjGrant = normalizeAdjacentGrant(tpl.grantDodgeAdjacentAllies);
      if (adjGrant && adjGrant.attempts > 0) {
        for (const dir of DIRS) {
          const rr = r + dir.dr;
          const cc = c + dir.dc;
          if (!inBounds(rr, cc)) continue;
          const target = state.board?.[rr]?.[cc]?.unit;
          if (!target) continue;
          if (target.owner !== unit.owner) continue;
          addContribution(contributions, rr, cc, {
            attempts: adjGrant.attempts,
            chance: adjGrant.chance,
          });
        }
      }

      const enemyGain = normalizeEnemyGain(tpl.gainDodgeFromAdjacentEnemies);
      if (enemyGain && enemyGain.attemptsPerEnemy > 0) {
        let enemies = 0;
        for (const dir of DIRS) {
          const rr = r + dir.dr;
          const cc = c + dir.dc;
          if (!inBounds(rr, cc)) continue;
          const target = state.board?.[rr]?.[cc]?.unit;
          if (!target) continue;
          if (target.owner === unit.owner) continue;
          enemies += 1;
        }
        if (enemies > 0) {
          addContribution(contributions, r, c, {
            attempts: enemyGain.attemptsPerEnemy * enemies,
          });
        }
      }
    }
  }

  const updated = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = state.board[r][c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tpl = CARDS[unit.tplId];
      if (!tpl) {
        if (unit.dodgeState) delete unit.dodgeState;
        continue;
      }
      const base = getDodgeConfig(tpl);
      const contrib = contributions.get(`${r},${c}`) || [];
      let totalAttempts = 0;
      let overrideChance = null;
      for (const item of contrib) {
        totalAttempts += normalizeAttempts(item?.attempts || 0);
        if (item?.chance != null && Number.isFinite(item.chance)) {
          overrideChance = item.chance;
        }
      }
      if (!base && totalAttempts <= 0) {
        if (unit.dodgeState) {
          delete unit.dodgeState;
          updated.push({ r, c, removed: true });
        }
        continue;
      }
      if (!base && totalAttempts > 0) {
        const cfg = {
          chance: overrideChance != null ? overrideChance : 0.5,
          successes: totalAttempts,
          keyword: totalAttempts === 1 ? 'DODGE_ATTEMPT' : 'DODGE_ATTEMPT',
        };
        ensureDodgeState(unit, tpl, cfg);
        updated.push({ r, c, attempts: cfg.successes, chance: cfg.chance });
        continue;
      }
      if (base) {
        if (base.successes == null) {
          const cfg = {
            chance: overrideChance != null ? overrideChance : base.chance,
            successes: null,
            keyword: base.keyword,
          };
          ensureDodgeState(unit, tpl, cfg);
          if (overrideChance != null) {
            updated.push({ r, c, unlimited: true, chance: cfg.chance });
          }
          continue;
        }
        const cfg = {
          chance: overrideChance != null ? overrideChance : base.chance,
          successes: base.successes + totalAttempts,
          keyword: base.keyword,
        };
        ensureDodgeState(unit, tpl, cfg);
        updated.push({ r, c, attempts: cfg.successes, chance: cfg.chance });
      }
    }
  }
  return { updated };
}
