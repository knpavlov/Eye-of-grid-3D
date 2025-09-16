// Bridge file to expose core modules to existing global code progressively
import * as Constants from './core/constants.js';
import { CARDS } from './core/cards.js';
import { DECKS } from './core/decks.js';
// Стартовая колода по умолчанию — первая из списка
const STARTER_FIRESET = DECKS[0]?.cards || [];
import * as Rules from './core/rules.js';
import { reducer, A, startGame, drawOne, drawOneNoAdd, shuffle, countControlled, countUnits } from './core/state.js';
import { netState, NET_ON } from './core/netState.js';
import { createStore, makeMiddleware } from './lib/store.js';
// Scene modules (new)
import {
  initThreeJS as sceneInitThreeJS,
  worldToScreen as sceneWorldToScreen,
  animate as sceneAnimate,
} from './scene/index.js';
import * as Board from './scene/board.js';
import * as Cards from './scene/cards.js';
import * as Units from './scene/units.js';
import * as Hand from './scene/hand.js';
import * as Interactions from './scene/interactions.js';
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
import { updateUI } from './ui/update.js';
import * as UIActions from './ui/actions.js';
import * as SceneEffects from './scene/effects.js';
import * as UISpellUtils from './ui/spellUtils.js';
import * as Spells from './spells/handlers.js';
import './ui/statusChip.js';
import * as InputLock from './ui/inputLock.js';
import { attachUIEvents } from './ui/domEvents.js';
import * as BattleSplash from './ui/battleSplash.js';
import * as DeckSelect from './ui/deckSelect.js';
import * as MainMenu from './ui/mainMenu.js';
import * as DeckBuilder from './ui/deckBuilder.js';
import * as DeckNetwork from './net/decks.js';
import { playDeltaAnimations } from './scene/delta.js';
import { createMetaObjects } from './scene/meta.js';
import * as SummonLock from './ui/summonLock.js';
import * as CancelButton from './ui/cancelButton.js';

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
  window.rotateCost = Constants.rotateCost;

  window.CARDS = CARDS;
  window.STARTER_FIRESET = STARTER_FIRESET;
  window.DECKS = DECKS;

  window.hasAdjacentGuard = Rules.hasAdjacentGuard;
  window.computeCellBuff = Rules.computeCellBuff;
  window.effectiveStats = Rules.effectiveStats;
  window.computeHits = Rules.computeHits;
  window.stagedAttack = Rules.stagedAttack;
  window.magicAttack = Rules.magicAttack;

  window.shuffle = shuffle;
  window.drawOne = drawOne;
  window.drawOneNoAdd = drawOneNoAdd;
  window.countControlled = countControlled;
  window.countUnits = countUnits;
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
  try { applyGameState(s); } catch {}
}

if (typeof window !== 'undefined') {
  DeckNetwork.refreshDecks().catch(err => console.warn('[main] Не удалось синхронизировать колоды с сервером', err));
}

// Унифицированное применение нового состояния игры
export function applyGameState(state) {
  try {
    // Обновляем глобальную переменную
    window.gameState = state;
    // Синхронизируем стораж, чтобы состояние не откатывалось в конце хода
    window.__store?.dispatch({ type: A.REPLACE_STATE, payload: state });
    // Сообщаем страницам с локальной переменной gameState о новом состоянии
    // (например, index.html держит собственную копию)
    window.setGameState?.(state);
  } catch {}
}
try { if (typeof window !== 'undefined') window.applyGameState = applyGameState; } catch {}

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
  window.__hand = {
    setHandCardHoverVisual: Hand.setHandCardHoverVisual,
    updateHand: Hand.updateHand,
    animateDrawnCardToHand: Hand.animateDrawnCardToHand,
  };
  window.__interactions = Interactions;
  window.__ui = window.__ui || {};
  window.__ui.turnTimer = TurnTimer;
  window.__ui.banner = Banner;
  window.__ui.notifications = UINotifications;
  window.__ui.log = UILog;
  window.__ui.mana = UIMana;
  window.__ui.panels = UIPanels;
  window.__ui.handCount = HandCount;
  window.__ui.actions = UIActions;
  window.__ui.spellUtils = UISpellUtils;
  window.__ui.updateUI = updateUI;
  window.__ui.inputLock = InputLock;
  window.__ui.summonLock = SummonLock;
  window.__ui.cancelButton = CancelButton;
  window.__ui.deckSelect = DeckSelect;
  window.__ui.deckBuilder = DeckBuilder;
  window.__ui.mainMenu = MainMenu;
  window.updateUI = updateUI;
  window.__fx = SceneEffects;
  window.spendAndDiscardSpell = UISpellUtils.spendAndDiscardSpell;
  window.burnSpellCard = UISpellUtils.burnSpellCard;
  window.__spells = Spells;
  window.showTurnSplash = Banner.showTurnSplash;
  window.queueTurnSplash = Banner.queueTurnSplash;
  window.forceTurnSplashWithRetry = Banner.forceTurnSplashWithRetry;
  window.requestTurnSplash = Banner.requestTurnSplash;
  window.showBattleSplash = BattleSplash.showBattleSplash;
  window.attachUIEvents = attachUIEvents;
  window.__ui.cancelButton.setupCancelButton();
  window.playDeltaAnimations = playDeltaAnimations;
  window.createMetaObjects = createMetaObjects;
} catch {}

import * as UISync from './ui/sync.js';
try { UISync.attachSocketUIRefresh(); if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.sync = UISync; } } catch {}

