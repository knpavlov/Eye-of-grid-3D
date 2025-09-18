// Дополнительные стоимости активации, накладываемые аурами существ
import { CARDS } from '../cards.js';

const ADJACENT_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function resolvePenaltyValue(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'object') {
    if (typeof raw.amount === 'number') return raw.amount;
    if (typeof raw.penalty === 'number') return raw.penalty;
    if (typeof raw.value === 'number') return raw.value;
  }
  return 0;
}

export function computeActivationPenalty(state, position = {}, opts = {}) {
  if (!state?.board) return 0;
  const { r, c } = position;
  if (typeof r !== 'number' || typeof c !== 'number') return 0;
  const unit = opts.unit || state.board?.[r]?.[c]?.unit;
  if (!unit) return 0;
  const owner = unit.owner;
  let total = 0;

  for (const [dr, dc] of ADJACENT_OFFSETS) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inBounds(rr, cc)) continue;
    const neighbor = state.board?.[rr]?.[cc]?.unit;
    if (!neighbor || neighbor.owner === owner) continue;
    const tplNeighbor = CARDS[neighbor.tplId];
    if (!tplNeighbor) continue;
    const alive = (neighbor.currentHP ?? tplNeighbor.hp ?? 0) > 0;
    if (!alive) continue;
    const amount = resolvePenaltyValue(tplNeighbor.increaseEnemyActivationAdjacent);
    if (!amount) continue;
    total += amount;
  }

  return total;
}
