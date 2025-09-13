// Core constants and small helpers (no DOM/THREE dependencies)

// Directions on 3x3 board
export const DIR_VECTORS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

export const turnCW = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const turnCCW = { N: 'W', W: 'S', S: 'E', E: 'N' };

// Element relations
export const OPPOSITE_ELEMENT = {
  FIRE: 'WATER',
  WATER: 'FIRE',
  EARTH: 'FOREST',
  FOREST: 'EARTH'
};

// For UI display (placeholder emojis to avoid broken glyphs)
export const elementEmoji = {
  FIRE: '🔥',
  WATER: '💧',
  EARTH: '⛰️',
  FOREST: '🌿',
  MECH: '⚙️'
};

// Facing angles (game-space) — UI can map to THREE Yaw separately
export const facingDeg = { N: 0, E: -90, S: 180, W: 90 };

// Helpers
export const uid = () => Math.random().toString(36).slice(2, 9);
export const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;
export const capMana = (m) => Math.min(10, m);

// Стоимость атаки теперь рассчитывается в abilities.js
export { attackCost } from './abilities.js';

