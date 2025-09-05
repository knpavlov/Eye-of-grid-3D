// Bridge file to expose core modules to existing global code progressively
import * as Constants from './core/constants.js';
import { CARDS, STARTER_FIRESET } from './core/cards.js';
import * as Rules from './core/rules.js';
import { reducer, A, startGame, drawOne, drawOneNoAdd, shuffle, countControlled } from './core/state.js';
import { netState, NET_ON } from './core/netState.js';
import { createStore, makeMiddleware } from './lib/store.js';
// Scene modules (new)
import { initThreeJS as sceneInitThreeJS, worldToScreen as sceneWorldToScreen, animate as sceneAnimate } from './scene/index.js';
import * as Board from './scene/board.js';
import * as Cards from './scene/cards.js';
import * as Units from './scene/units.js';
import { getCtx as getSceneCtx } from './scene/context.js';
// UI modules
import * as UINotifications from './ui/notifications.js';
import * as UILog from './ui/log.js';
import * as UIMana from './ui/mana.js';
import * as UIPanels from './ui/panels.js';
// UI modules
import * as TurnTimer from './ui/turnTimer.js';
import * as Banner from './ui/banner.js';
import * as HandCount from './ui/handCount.js';
import './ui/statusChip.js';

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
  window.computeCellBuff = Rules.computeCellBuff;
  window.effectiveStats = Rules.effectiveStats;
  window.computeHits = Rules.computeHits;
  window.stagedAttack = Rules.stagedAttack;
  window.magicAttack = Rules.magicAttack;

  window.shuffle = shuffle;
  window.drawOne = drawOne;
  window.drawOneNoAdd = drawOneNoAdd;
  window.countControlled = countControlled;
  window.startGame = startGame;

  // Runtime net state globals
  Object.defineProperties(window, {
    NET_ACTIVE: {
      get: () => netState.NET_ACTIVE,
      set: v => { netState.NET_ACTIVE = v; },
      configurable: true,
    },
    MY_SEAT: {
      get: () => netState.MY_SEAT,
      set: v => { netState.MY_SEAT = v; },
      configurable: true,
    },
    APPLYING: {
      get: () => netState.APPLYING,
      set: v => { netState.APPLYING = v; },
      configurable: true,
    },
    __endTurnInProgress: {
      get: () => netState.__endTurnInProgress,
      set: v => { netState.__endTurnInProgress = v; },
      configurable: true,
    },
    drawAnimationActive: {
      get: () => netState.drawAnimationActive,
      set: v => { netState.drawAnimationActive = v; },
      configurable: true,
    },
    splashActive: {
      get: () => netState.splashActive,
      set: v => { netState.splashActive = v; },
      configurable: true,
    },
  });
  window.__netState = netState;
  window.NET_ON = NET_ON;
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
  window.__cards = {
    getCachedTexture: Cards.getCachedTexture,
    preloadCardTextures: Cards.preloadCardTextures,
    createCard3D: Cards.createCard3D,
    drawCardFace: Cards.drawCardFace,
  };
  window.__units = {
    updateUnits: Units.updateUnits,
  };
  window.__ui = window.__ui || {};
  window.__ui.turnTimer = TurnTimer;
  window.__ui.banner = Banner;
  window.__ui.notifications = UINotifications;
  window.__ui.log = UILog;
  window.__ui.mana = UIMana;
  window.__ui.panels = UIPanels;
  window.__ui.handCount = HandCount;
} catch {}

import * as UISync from './ui/sync.js';
try { UISync.attachSocketUIRefresh(); if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.sync = UISync; } } catch {}

