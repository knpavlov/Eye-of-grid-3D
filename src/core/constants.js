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
  BIOLITH: '⚙️'
};

// Facing angles (game-space) — UI can map to THREE Yaw separately
export const facingDeg = { N: 0, E: -90, S: 180, W: 90 };

// Helpers
export const uid = () => Math.random().toString(36).slice(2, 9);
export const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;
// Ограничение значения маны в допустимых границах (0..10) с приведением к целому числу
export const capMana = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  const normalized = Math.round(raw);
  if (normalized <= 0) return 0;
  if (normalized >= 10) return 10;
  return normalized;
};

import { activationCost, rotateCost as rawRotateCost } from './abilities.js';

// Стоимость атаки с учётом скидок
export const attackCost = (tpl, fieldElement, ctx) => activationCost(tpl, fieldElement, ctx);

// Стоимость поворота без скидок
export const rotateCost = (tpl, fieldElement, ctx) => rawRotateCost(tpl, fieldElement, ctx);

