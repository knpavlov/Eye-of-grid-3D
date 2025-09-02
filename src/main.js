// Bridge file to expose core modules to existing global code progressively
import * as Constants from './core/constants.js';
import { CARDS, STARTER_FIRESET } from './core/cards.js';
import * as Rules from './core/rules.js';
import { reducer, A, startGame, drawOne, drawOneNoAdd, shuffle, countControlled } from './core/state.js';
import { createStore, makeMiddleware } from './lib/store.js';
// Scene modules (new)
import { initThreeJS as sceneInitThreeJS, worldToScreen as sceneWorldToScreen, animate as sceneAnimate } from './scene/index.js';
import * as Board from './scene/board.js';
import { getCtx as getSceneCtx } from './scene/context.js';

// Expose to window to keep compatibility while refactoring incrementally
try {
  window.DIR_VECTORS = Constants.DIR_VECTORS;
  window.turnCW = Constants.turnCW;
  window.turnCCW = Constants.turnCCW;
  window.OPPOSITE_ELEMENT = Constants.OPPOSITE_ELEMENT;
  window.elementEmoji = Constants.elementEmoji;
  window.facingDeg = Constants.facingDeg;
  window.uid = Constants.uid;
  window.inBounds = Constants.inBounds;
  window.capMana = Constants.capMana;
  window.attackCost = Constants.attackCost;

  window.CARDS = CARDS;
  window.STARTER_FIRESET = STARTER_FIRESET;

  window.hasAdjacentGuard = Rules.hasAdjacentGuard;
  window.dirsForPattern = Rules.dirsForPattern;
  window.effectiveStats = Rules.effectiveStats;
  window.computeHits = Rules.computeHits;
  window.stagedAttack = Rules.stagedAttack;
  window.magicAttack = Rules.magicAttack;

  window.shuffle = shuffle;
  window.drawOne = drawOne;
  window.drawOneNoAdd = drawOneNoAdd;
  window.countControlled = countControlled;
  window.startGame = startGame;
} catch {}

// Optional: basic store and a push-state placeholder middleware
const netMiddleware = makeMiddleware(({ getState, next, action }) => {
  const result = next(action);
  // Hook here for multiplayer sync (schedulePush) later
  try { if (window.NET_ACTIVE && window.schedulePush) window.schedulePush(action.type); } catch {}
  return result;
});

export const store = createStore(reducer, undefined, [netMiddleware]);
try { window.__store = store; } catch {}

// Initialize only if no existing gameState is present (non-destructive)
if (typeof window !== 'undefined' && !window.gameState) {
  const s = startGame(STARTER_FIRESET, STARTER_FIRESET);
  try { window.gameState = s; } catch {}
}

// Expose new scene/board API for gradual migration from inline script
try {
  window.__scene = {
    initThreeJS: sceneInitThreeJS,
    worldToScreen: sceneWorldToScreen,
    animate: sceneAnimate,
    getCtx: getSceneCtx,
  };
  window.__board = {
    createBoard: Board.createBoard,
    getTileMaterial: Board.getTileMaterial,
    updateTileMaterialsFor: Board.updateTileMaterialsFor,
    createProceduralTileTexture: Board.createProceduralTileTexture,
  };
} catch {}
