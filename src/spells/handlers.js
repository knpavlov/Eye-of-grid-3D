// Centralized spell-specific logic.
// Each handler receives a context object with current state references.
// Handlers may rely on globals (addLog, updateHand, etc.) while the
// surrounding code handles index/lookups and basic validations.

import { spendAndDiscardSpell, offerSpellToEye, burnSpellCard } from '../ui/spellUtils.js';
import { getCtx } from '../scene/context.js';
import {
  interactionState,
  resetCardSelection,
  returnCardToHand,
  requestAutoEndTurn,
} from '../scene/interactions.js';
import { discardHandCard } from '../scene/discard.js';
import { computeFieldquakeLockedCells } from '../core/fieldLocks.js';
import { computeCellBuff, applyFieldTransitionToUnit } from '../core/fieldEffects.js';
import { refreshPossessionsUI } from '../ui/possessions.js';
import { applyDeathDiscardEffects } from '../core/abilityHandlers/discard.js';
import { playFieldquakeFx, playFieldquakeFxBatch } from '../scene/fieldquakeFx.js';
import { animateManaGainFromWorld } from '../ui/mana.js';
import { applyFieldquakeToCell, collectFieldquakeDeaths } from '../core/abilityHandlers/fieldquake.js';
import { applyFieldFatalityCheck, describeFieldFatality } from '../core/abilityHandlers/fieldHazards.js';
import { highlightTiles, clearHighlights } from '../scene/highlight.js';
import { createDeathEntry } from '../core/abilityHandlers/deathRecords.js';
import { capMana } from '../core/constants.js';
import {
  computeElementalBurstPlan,
  applyElementalBurstPlan,
  countFieldsByElement,
} from '../core/spells/elementalDominion.js';
import { normalizeElementName } from '../core/utils/elements.js';

// Универсальные хелперы для повторного использования механик заклинаний
function getUnitMeshAt(r, c) {
  const ctx = getCtx();
  const { unitMeshes } = ctx;
  if (!Array.isArray(unitMeshes)) return null;
  return unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || null;
}

function getTileMeshAt(r, c) {
  const ctx = getCtx();
  const { tileMeshes } = ctx;
  if (!Array.isArray(tileMeshes) || !Array.isArray(tileMeshes[r])) return null;
  return tileMeshes[r][c] || null;
}

function spawnHpShiftText(r, c, delta) {
  if (!delta) return;
  const mesh = getUnitMeshAt(r, c);
  if (!mesh) return;
  const color = delta > 0 ? '#22c55e' : '#ef4444';
  try { window.__fx.spawnDamageText(mesh, `${delta > 0 ? '+' : ''}${delta}`, color); } catch {}
}

function performFieldquakeAcrossBoard(state, positions, opts = {}) {
  const result = { events: [], logs: [], deaths: [] };
  if (!state?.board || !Array.isArray(positions) || !positions.length) return result;
  const respectLocks = opts.respectLocks !== false;
  const lockedBase = respectLocks ? computeFieldquakeLockedCells(state) : [];
  const lockedSet = respectLocks ? new Set(lockedBase.map(p => `${p.r},${p.c}`)) : null;

  for (const pos of positions) {
    if (!pos) continue;
    const r = Number(pos.r);
    const c = Number(pos.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    const fq = applyFieldquakeToCell(state, r, c, { respectLocks, lockedSet });
    if (!fq?.changed) {
      if (fq?.reason === 'LOCKED') {
        const prefix = opts.sourceName ? `${opts.sourceName}:` : 'Fieldquake:';
        result.logs.push(`${prefix} поле (${r + 1},${c + 1}) защищено и не меняется.`);
      }
      continue;
    }
    result.events.push({ r: fq.r, c: fq.c, prevElement: fq.prevElement, nextElement: fq.nextElement });
    const prefix = opts.sourceName ? `${opts.sourceName}:` : 'Fieldquake:';
    result.logs.push(`${prefix} поле (${fq.r + 1},${fq.c + 1}) ${fq.prevElement}→${fq.nextElement}.`);

    if (fq.tpl && fq.hpShift?.deltaHp) {
      const delta = fq.hpShift.deltaHp;
      const before = fq.hpShift.beforeHp;
      const after = fq.hpShift.afterHp;
      const unitName = fq.tpl.name || 'Существо';
      const elementLabel = fq.nextElement || 'нейтральном поле';
      const text = delta > 0
        ? `${unitName} усиливается на ${elementLabel}: HP ${before}→${after}.`
        : `${unitName} теряет силу на ${elementLabel}: HP ${before}→${after}.`;
      result.logs.push(text);
      spawnHpShiftText(fq.r, fq.c, delta);
    }

    if (fq.tpl && fq.fatality?.dies) {
      const fatalLog = describeFieldFatality(fq.tpl, fq.fatality, { name: fq.tpl.name });
      if (fatalLog) result.logs.push(fatalLog);
    }

    const deathEntries = collectFieldquakeDeaths(state, fq, { keepUnits: true }) || [];
    if (deathEntries.length) {
      for (const d of deathEntries) {
        if (d && d.element == null) {
          d.element = fq.nextElement || state.board?.[fq.r]?.[fq.c]?.element || null;
        }
      }
      result.deaths.push(...deathEntries);
    }
  }

  return result;
}

function processSpellDeaths(deaths, { cause = 'SPELL', delayMs = 1000 } = {}) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  const ctx = getCtx();
  const { unitMeshes, tileMeshes, THREE } = ctx;
  const valid = [];

  for (const death of deaths) {
    if (!death) continue;
    const r = Number(death.r);
    const c = Number(death.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    const cell = gameState.board?.[r]?.[c];
    const unitRef = cell?.unit;
    const tplId = death.tplId || unitRef?.tplId;
    if (!unitRef || !tplId) continue;
    try { gameState.players?.[death.owner]?.graveyard?.push(CARDS[tplId]); } catch {}
    const mesh = Array.isArray(unitMeshes)
      ? unitMeshes.find(m => m.userData.row === r && m.userData.col === c)
      : null;
    if (mesh && THREE && THREE.Vector3) {
      try { window.__fx.dissolveAndAsh(mesh, new THREE.Vector3(0, 0, 0.6), 0.9); } catch {}
    }
    const tile = Array.isArray(tileMeshes) && Array.isArray(tileMeshes[r]) ? tileMeshes[r][c] : null;
    if (tile && THREE && THREE.Vector3) {
      try {
        const pos = tile.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        animateManaGainFromWorld(pos, death.owner, { amount: 1, visualOnly: true });
      } catch {}
    }
    cell.unit = null;
    valid.push({ ...death, tplId });
  }

  if (!valid.length) return;
  const discardEffects = applyDeathDiscardEffects(gameState, valid, { cause });
  if (Array.isArray(discardEffects.logs)) {
    for (const text of discardEffects.logs) addLog(text);
  }

  setTimeout(() => {
    refreshPossessionsUI(gameState);
    updateUnits();
    updateUI();
  }, delayMs);
}


// --- Доминионские заклинания с жертвой существ ---

const ELEMENTAL_LABELS = {
  FIRE: { field: 'огненное поле', element: 'огненной стихии', plural: 'огненных' },
  WATER: { field: 'водное поле', element: 'водной стихии', plural: 'водных' },
  EARTH: { field: 'земное поле', element: 'земной стихии', plural: 'земных' },
  FOREST: { field: 'лесное поле', element: 'лесной стихии', plural: 'лесных' },
  BIOLITH: { field: 'биолитовое поле', element: 'биолитной стихии', plural: 'биолитовых' },
};

const ELEMENTAL_DOMINION_SPELLS = {
  SPELL_SCIONDAR_INFERNO: {
    element: 'FIRE',
    requireFieldElement: 'FIRE',
    selectionMode: 'SINGLE',
  },
  SPELL_ICE_FLOOD_OF_OKUNADA: {
    element: 'WATER',
    requireFieldElement: 'WATER',
    selectionMode: 'SINGLE',
  },
  SPELL_FIST_OF_VERZAR: {
    element: 'EARTH',
    requireFieldElement: 'EARTH',
    selectionMode: 'SINGLE',
  },
  SPELL_WRATHFUL_WINDS_OF_JUNO: {
    element: 'FOREST',
    requireFieldElement: 'FOREST',
    selectionMode: 'SINGLE',
  },
  SPELL_BLINDING_SKIES: {
    element: 'BIOLITH',
    requireFieldElement: 'BIOLITH',
    selectionMode: 'ALL_BIOLITH',
  },
};

function getElementLabels(element) {
  const normalized = normalizeElementName(element);
  return ELEMENTAL_LABELS[normalized] || {
    field: 'нужное поле',
    element: 'нужной стихии',
    plural: 'нужных',
  };
}

function formatNameList(names) {
  if (!Array.isArray(names) || !names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function cancelElementalBurstSelection() {
  const pending = interactionState.pendingElementalBurst;
  if (!pending) return;
  if (pending.discards?.length) {
    showNotification('Жертвоприношение уже началось, отмена невозможна.', 'error');
    try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
    return;
  }
  interactionState.pendingElementalBurst = null;
  interactionState.pendingDiscardSelection = null;
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  if (pending.cardMesh) {
    try { pending.cardMesh.visible = true; } catch {}
  }
  resetCardSelection();
  updateHand();
  updateUI();
}

function updateElementalBurstPrompt(pending) {
  if (!pending) return;
  const cfg = pending.config || {};
  const labels = getElementLabels(cfg.element);
  const remaining = Math.max(0, (pending.discardCount || 0) - (pending.discards?.length || 0));
  const neededMatch = Math.max(0, (pending.requiredMatches || 0) - (pending.matched || 0));
  let message;
  if (!pending.discards?.length) {
    message = `Выберите 2 существа для жертвоприношения (минимум одно ${labels.element}).`;
  } else if (remaining === 1 && neededMatch > 0) {
    message = `Выберите существо ${labels.element} для завершения жертвы.`;
  } else if (remaining > 0) {
    message = `Выберите ещё ${remaining} существо для жертвоприношения.`;
  } else {
    message = 'Жертвоприношение завершается...';
  }
  try {
    window.__ui?.panels?.showPrompt?.(message, () => {
      cancelElementalBurstSelection();
      updateUI();
    });
  } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
  return message;
}

function handleElementalBurstDiscard(handIdx) {
  const pending = interactionState.pendingElementalBurst;
  if (!pending) return;
  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    cancelElementalBurstSelection();
    return;
  }
  const player = Number.isInteger(pending.playerIndex) ? state.players?.[pending.playerIndex] : null;
  if (!player) {
    cancelElementalBurstSelection();
    return;
  }
  if (!Number.isInteger(handIdx)) {
    showNotification('Некорректный выбор карты', 'error');
    return;
  }
  const cardTpl = player.hand?.[handIdx];
  if (!cardTpl || cardTpl.type !== 'UNIT') {
    showNotification('Нужно выбрать карту существа', 'error');
    return;
  }
  const labels = getElementLabels(pending.config?.element);
  const normalizedElement = normalizeElementName(cardTpl.element);
  const remainingSlots = Math.max(0, (pending.discardCount || 0) - (pending.discards?.length || 0));
  const neededMatch = Math.max(0, (pending.requiredMatches || 0) - (pending.matched || 0));
  if (
    neededMatch > 0
    && normalizedElement !== pending.requiredElement
    && remainingSlots <= neededMatch
  ) {
    showNotification(`Нужно выбрать существо ${labels.element}.`, 'error');
    return;
  }

  const discarded = discardHandCard(player, handIdx);
  if (!discarded) return;
  const discardedElement = normalizeElementName(discarded.element);
  pending.discards = Array.isArray(pending.discards) ? pending.discards : [];
  pending.discards.push({ tplId: discarded.id, element: discardedElement });
  if (discardedElement === pending.requiredElement) {
    pending.matched = (pending.matched || 0) + 1;
  }

  const remaining = Math.max(0, (pending.discardCount || 0) - pending.discards.length);
  if (remaining > 0) {
    updateElementalBurstPrompt(pending);
    return;
  }

  interactionState.pendingDiscardSelection = null;
  finalizeElementalBurst();
}

function startElementalBurstDiscard() {
  const pending = interactionState.pendingElementalBurst;
  if (!pending) return;
  updateElementalBurstPrompt(pending);
  interactionState.pendingDiscardSelection = {
    requiredType: 'UNIT',
    forced: true,
    invalidMessage: 'Нужно выбрать карту существа',
    onPicked: handIdx => handleElementalBurstDiscard(handIdx),
  };
}

function ensureSpellCardIndex(player, pending) {
  if (!player || !pending) return -1;
  const ref = pending.cardRef || pending.tpl || null;
  if (!Array.isArray(player.hand)) return -1;
  if (pending.handIndex != null && player.hand[pending.handIndex] === ref) {
    return pending.handIndex;
  }
  const byRef = ref ? player.hand.indexOf(ref) : -1;
  if (byRef >= 0) return byRef;
  if (pending.spellId) {
    return player.hand.findIndex(card => card && card.id === pending.spellId);
  }
  return -1;
}

function logElementalBurstSacrifice(pending) {
  if (!pending?.tpl || !Array.isArray(pending.discards) || !pending.discards.length) return;
  const names = pending.discards
    .map(info => (info?.tplId && CARDS?.[info.tplId]?.name) || 'существо')
    .filter(Boolean);
  if (!names.length) return;
  addLog(`${pending.tpl.name}: принесены в жертву ${formatNameList(names)}.`);
}

function finalizeElementalBurst() {
  const pending = interactionState.pendingElementalBurst;
  if (!pending) return;
  interactionState.pendingElementalBurst = null;
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) return;
  const player = Number.isInteger(pending.playerIndex) ? state.players?.[pending.playerIndex] : null;
  if (!player) return;

  let handIdx = ensureSpellCardIndex(player, pending);
  if (handIdx < 0) {
    showNotification('Карта заклинания уже недоступна', 'error');
    return;
  }

  const cfg = pending.config || {};
  const labels = getElementLabels(cfg.element);
  const planConfig = { element: cfg.damageElement || cfg.element };
  if (cfg.selectionMode === 'ALL_BIOLITH') {
    planConfig.mode = 'ALL_BIOLITH';
  } else if (pending.target) {
    planConfig.centers = [pending.target];
  } else {
    planConfig.centers = [];
  }

  const plan = computeElementalBurstPlan(state, pending.playerIndex, planConfig);
  const result = applyElementalBurstPlan(state, plan);
  const tileMesh = pending.tileMesh || (pending.target ? getTileMeshAt(pending.target.r, pending.target.c) : null);

  logElementalBurstSacrifice(pending);
  addLog(`${pending.tpl.name}: количество ${labels.plural} полей = ${result.damage}.`);

  if (Array.isArray(result.hits) && result.hits.length) {
    for (const hit of result.hits) {
      const tplName = CARDS?.[hit.tplId]?.name || 'Существо';
      const dmg = Math.abs(hit.delta || 0);
      const cellLabel = `(${hit.r + 1},${hit.c + 1})`;
      addLog(`${pending.tpl.name}: ${tplName} ${cellLabel} получает ${dmg} урона (HP ${hit.before}→${hit.after}).`);
      spawnHpShiftText(hit.r, hit.c, hit.delta);
    }
  } else {
    addLog(`${pending.tpl.name}: подходящих вражеских целей не найдено.`);
  }

  burnSpellCard(pending.tpl, tileMesh, pending.cardMesh || null);
  spendAndDiscardSpell(player, handIdx);
  resetCardSelection();
  updateHand();
  refreshPossessionsUI(state);
  updateUnits();
  updateUI();

  if (Array.isArray(result.deaths) && result.deaths.length) {
    processSpellDeaths(result.deaths);
  }
}

function startElementalBurst(ctx) {
  const { tpl, pl, idx, tileMesh, cardMesh } = ctx;
  const cfg = ELEMENTAL_DOMINION_SPELLS[tpl.id];
  if (!cfg) return false;

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    showNotification('Игра не готова к обработке заклинания', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return true;
  }

  if (interactionState.pendingElementalBurst) {
    showNotification('Сначала завершите текущее жертвоприношение.', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return true;
  }
  if (interactionState.pendingDiscardSelection) {
    showNotification('Сначала завершите другой выбор карты.', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return true;
  }

  const labels = getElementLabels(cfg.element);
  let target = null;
  let resolvedTile = tileMesh || null;

  if (cfg.selectionMode !== 'ALL_BIOLITH') {
    const r = tileMesh?.userData?.row ?? null;
    const c = tileMesh?.userData?.col ?? null;
    if (r == null || c == null) {
      showNotification(`Нужно выбрать ${labels.field}.`, 'error');
      if (cardMesh) returnCardToHand(cardMesh);
      return true;
    }
    const cell = state.board?.[r]?.[c];
    const cellElement = normalizeElementName(cell?.element);
    if (cellElement !== normalizeElementName(cfg.requireFieldElement)) {
      showNotification(`Выберите ${labels.field}.`, 'error');
      if (cardMesh) returnCardToHand(cardMesh);
      return true;
    }
    target = { r, c };
    if (!resolvedTile) {
      resolvedTile = getTileMeshAt(r, c);
    }
  } else {
    const totalBiolith = countFieldsByElement(state, 'BIOLITH');
    if (!totalBiolith) {
      showNotification('На арене нет биолитовых полей.', 'error');
      if (cardMesh) returnCardToHand(cardMesh);
      return true;
    }
  }

  const handUnits = Array.isArray(pl.hand) ? pl.hand.filter(card => card?.type === 'UNIT') : [];
  if (handUnits.length < 2) {
    showNotification('В руке недостаточно существ для жертвы.', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return true;
  }
  const requiredElement = normalizeElementName(cfg.element);
  const hasRequired = handUnits.some(card => normalizeElementName(card.element) === requiredElement);
  if (!hasRequired) {
    showNotification(`В руке нет существ ${labels.element}.`, 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return true;
  }

  interactionState.pendingElementalBurst = {
    spellId: tpl.id,
    tpl,
    cardRef: tpl,
    playerIndex: state.active,
    handIndex: idx,
    requiredElement,
    requiredMatches: 1,
    discardCount: 2,
    discards: [],
    matched: 0,
    target,
    tileMesh: resolvedTile || null,
    cardMesh: cardMesh || null,
    config: {
      ...cfg,
      element: cfg.element,
      damageElement: cfg.element,
    },
  };

  interactionState.spellDragHandled = true;
  if (cardMesh) returnCardToHand(cardMesh);

  addLog(`${tpl.name}: выберите карты существ для жертвы (минимум одно ${labels.element}).`);
  startElementalBurstDiscard();
  return true;
}

const RIOTOUS_IMPUNITY_ORDER = [
  { r: 1, c: 1 },
  { r: 0, c: 1 },
  { r: 0, c: 2 },
  { r: 1, c: 2 },
  { r: 2, c: 2 },
  { r: 2, c: 1 },
  { r: 2, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: 0 },
];

function handleRiotousImpunity(ctx) {
  const { tpl, pl, idx, cardMesh, tileMesh } = ctx;
  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    showNotification('Игра не готова к обработке заклинания', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return;
  }

  const currentIdx = (typeof idx === 'number' && Array.isArray(pl.hand) && pl.hand[idx] === tpl)
    ? idx
    : (Array.isArray(pl.hand) ? pl.hand.indexOf(tpl) : -1);
  if (currentIdx < 0) {
    showNotification('Карта заклинания уже недоступна', 'error');
    if (cardMesh) returnCardToHand(cardMesh);
    return;
  }

  const resolvedTile = tileMesh || getTileMeshAt(1, 1) || null;
  burnSpellCard(tpl, resolvedTile, cardMesh || null);
  spendAndDiscardSpell(pl, currentIdx);
  resetCardSelection();
  updateHand();
  updateUI();

  addLog(`${tpl.name}: существа сражаются по часовой стрелке, начиная с центра.`);

  const runSequence = async () => {
    for (const pos of RIOTOUS_IMPUNITY_ORDER) {
      const cell = state.board?.[pos.r]?.[pos.c];
      const unit = cell?.unit;
      if (!unit) continue;
      const tplUnit = CARDS?.[unit.tplId];
      const currentHp = Number.isFinite(unit.currentHP) ? unit.currentHP : (tplUnit?.hp || 0);
      if (currentHp <= 0) continue;
      if (unit.lastAttackTurn === state.turn) {
        unit.lastAttackTurn = state.turn - 1;
      }
      if (typeof window.performBattleSequence === 'function') {
        try {
          await window.performBattleSequence(pos.r, pos.c, true, { reason: 'SCIONS_RIOTOUS_IMPUNITY' });
        } catch (err) {
          console.error('[RiotousImpunity] Ошибка последовательности боя:', err);
        }
      }
    }
    addLog(`${tpl.name}: ход завершается.`);
    requestAutoEndTurn();
  };

  runSequence().catch(err => {
    console.error('[RiotousImpunity] Ошибка запуска последовательности:', err);
    requestAutoEndTurn();
  });
}


function buildLockedFieldSet(state) {
  const locked = computeFieldquakeLockedCells(state) || [];
  const result = new Set();
  for (const pos of locked) {
    if (!pos) continue;
    const r = Number(pos.r);
    const c = Number(pos.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    result.add(`${r},${c}`);
  }
  return result;
}

function collectExchangeableCells(state, exclude = null) {
  if (!state?.board) return { cells: [], lockedSet: new Set() };
  const lockedSet = buildLockedFieldSet(state);
  const cells = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (exclude && r === exclude.r && c === exclude.c) continue;
      if (lockedSet.has(`${r},${c}`)) continue;
      const cell = state.board?.[r]?.[c];
      if (!cell || !cell.element) continue;
      cells.push({ r, c });
    }
  }
  return { cells, lockedSet };
}

function cancelFieldExchangeSelection() {
  interactionState.pendingSpellFieldExchange = null;
  clearHighlights();
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function highlightFieldExchangeTargets(exclude) {
  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    clearHighlights();
    return 0;
  }
  const { cells } = collectExchangeableCells(state, exclude);
  if (cells.length) highlightTiles(cells);
  else clearHighlights();
  return cells.length;
}

function finalizeFieldExchange(targetR, targetC, opts = {}) {
  const pending = interactionState.pendingSpellFieldExchange;
  if (!pending) return false;

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    cancelFieldExchangeSelection();
    return false;
  }

  const firstPos = pending.first || {};
  if (!Number.isInteger(firstPos.r) || !Number.isInteger(firstPos.c)) {
    cancelFieldExchangeSelection();
    return false;
  }

  if (firstPos.r === targetR && firstPos.c === targetC) {
    showNotification('Нужно выбрать другое поле для обмена', 'error');
    highlightFieldExchangeTargets(firstPos);
    return true;
  }

  const { lockedSet } = collectExchangeableCells(state);
  if (lockedSet.has(`${firstPos.r},${firstPos.c}`) || lockedSet.has(`${targetR},${targetC}`)) {
    showNotification('Одно из полей защищено от обмена', 'error');
    cancelFieldExchangeSelection();
    return true;
  }

  const firstCell = state.board?.[firstPos.r]?.[firstPos.c] || null;
  const secondCell = state.board?.[targetR]?.[targetC] || null;
  if (!firstCell || !secondCell || !firstCell.element || !secondCell.element) {
    showNotification('Поле недоступно для обмена', 'error');
    cancelFieldExchangeSelection();
    return true;
  }

  const activeIndex = typeof state.active === 'number' ? state.active : null;
  const player = opts.pl || (activeIndex != null ? state.players?.[activeIndex] : null);
  let handIndex = (opts.idx != null) ? opts.idx : pending.handIndex;
  const spellTpl = opts.tpl || (handIndex != null ? player?.hand?.[handIndex] : pending.tpl) || pending.tpl;

  if (!player || !spellTpl || spellTpl.id !== pending.spellId) {
    showNotification('Заклинание недоступно', 'error');
    cancelFieldExchangeSelection();
    return true;
  }

  const cost = Number(spellTpl.cost) || 0;
  if (player.mana < cost) {
    showNotification('Недостаточно маны для обмена полей', 'error');
    cancelFieldExchangeSelection();
    return true;
  }

  if (handIndex == null || player.hand?.[handIndex]?.id !== spellTpl.id) {
    handIndex = Array.isArray(player.hand)
      ? player.hand.findIndex(card => card && card.id === spellTpl.id)
      : -1;
  }
  if (handIndex < 0) {
    showNotification('Карта заклинания уже недоступна', 'error');
    cancelFieldExchangeSelection();
    return true;
  }

  const prevFirst = firstCell.element;
  const prevSecond = secondCell.element;

  firstCell.element = prevSecond;
  secondCell.element = prevFirst;

  const events = [
    { r: firstPos.r, c: firstPos.c, prevElement: prevFirst, nextElement: prevSecond },
    { r: targetR, c: targetC, prevElement: prevSecond, nextElement: prevFirst },
  ];

  const logs = [];
  const deaths = [];

  const processCell = (r, c, prevElement, nextElement) => {
    const cell = state.board?.[r]?.[c];
    const unit = cell?.unit || null;
    const tplUnit = unit ? CARDS?.[unit.tplId] : null;
    const fieldLabel = `${r + 1},${c + 1}`;
    logs.push(`${spellTpl.name}: поле (${fieldLabel}) ${prevElement}→${nextElement}.`);

    if (!unit || !tplUnit) return;

    const hpShift = applyFieldTransitionToUnit(unit, tplUnit, prevElement, nextElement);
    if (hpShift?.deltaHp) {
      const delta = hpShift.deltaHp;
      const before = hpShift.beforeHp;
      const after = hpShift.afterHp;
      const unitName = tplUnit.name || 'Существо';
      const msg = delta > 0
        ? `${unitName} усиливается на новом поле: HP ${before}→${after}.`
        : `${unitName} слабеет на новом поле: HP ${before}→${after}.`;
      logs.push(msg);
      spawnHpShiftText(r, c, delta);
    }

    const fatality = applyFieldFatalityCheck(unit, tplUnit, nextElement);
    if (fatality?.dies) {
      const fatalLog = describeFieldFatality(tplUnit, fatality, { name: tplUnit.name });
      if (fatalLog) logs.push(fatalLog);
    }

    if ((unit.currentHP ?? tplUnit.hp ?? 0) <= 0) {
      const deathEntry = createDeathEntry(state, unit, r, c) || {
        r,
        c,
        owner: unit.owner,
        tplId: unit.tplId,
        uid: unit.uid ?? null,
        element: nextElement,
      };
      deaths.push(deathEntry);
    }
  };

  processCell(firstPos.r, firstPos.c, prevFirst, prevSecond);
  processCell(targetR, targetC, prevSecond, prevFirst);

  cancelFieldExchangeSelection();

  const effectTile = opts.tileMesh || getTileMeshAt(targetR, targetC) || getTileMeshAt(firstPos.r, firstPos.c) || null;

  playFieldquakeFx(events[0]);
  playFieldquakeFx(events[1]);

  for (const text of logs) addLog(text);

  burnSpellCard(spellTpl, effectTile, opts.cardMesh || pending.cardMesh || null);
  spendAndDiscardSpell(player, handIndex);
  updateHand();

  if (deaths.length) {
    processSpellDeaths(deaths);
  }

  refreshPossessionsUI(state);
  updateUnits();
  updateUI();

  addLog(`${spellTpl.name}: ход завершается.`);
  requestAutoEndTurn();
  return true;
}

function cancelMesmerLapseSelection() {
  interactionState.pendingSpellLapse = null;
  interactionState.pendingDiscardSelection = null;
  clearHighlights();
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function finalizeMesmerLapseDiscard(handIdx) {
  const pending = interactionState.pendingSpellLapse;
  if (!pending) return;

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    cancelMesmerLapseSelection();
    return;
  }

  const activeIndex = typeof state.active === 'number' ? state.active : null;
  const player = pending.player || (activeIndex != null ? state.players?.[activeIndex] : null);
  if (!player) {
    cancelMesmerLapseSelection();
    return;
  }

  const opponentIndex = pending.opponentIndex != null ? pending.opponentIndex : (activeIndex === 0 ? 1 : 0);
  const opponent = Number.isInteger(opponentIndex) ? state.players?.[opponentIndex] : null;

  const spellTpl = pending.tpl || (pending.handIndex != null ? player.hand?.[pending.handIndex] : null);
  if (!spellTpl || spellTpl.id !== pending.spellId) {
    showNotification('Заклинание уже отменено', 'error');
    cancelMesmerLapseSelection();
    return;
  }

  if (!Number.isInteger(handIdx)) {
    showNotification('Некорректный выбор карты', 'error');
    cancelMesmerLapseSelection();
    return;
  }

  const chosenTpl = discardHandCard(player, handIdx);
  if (!chosenTpl || chosenTpl.type !== 'UNIT') {
    showNotification('Нужно выбрать карту существа', 'error');
    cancelMesmerLapseSelection();
    return;
  }

  const manaLoss = Math.max(0, Number(chosenTpl.cost) || 0);
  if (opponent) {
    const beforeRaw = Number.isFinite(opponent.mana) ? opponent.mana : 0;
    const before = capMana(beforeRaw);
    if (before !== beforeRaw) {
      opponent.mana = before;
    }
    const after = capMana(before - manaLoss);
    opponent.mana = after;
    const actualLoss = Math.max(0, before - after);
    if (actualLoss > 0) {
      addLog(`${spellTpl.name}: противник теряет ${actualLoss} маны.`);
      try {
        if (typeof window !== 'undefined') {
          const drainEvent = {
            amount: actualLoss,
            from: opponentIndex,
            before: { fromMana: before },
            after: { fromMana: after },
            drainOnly: true,
            toastOwnerIndex: opponentIndex,
            toastOptions: { source: 'MESMER_LAPSE' },
            reason: 'MESMER_LAPSE',
          };
          const manaFx = window.__ui?.manaStealFx || {};
          const netActive = (typeof NET_ON === 'function')
            ? NET_ON()
            : (typeof window.NET_ACTIVE !== 'undefined' ? !!window.NET_ACTIVE : false);
          const seatMatches = (typeof MY_SEAT === 'number' && typeof gameState?.active === 'number')
            ? (MY_SEAT === gameState.active)
            : true;
          const broadcastFx = netActive && seatMatches;
          if (typeof manaFx.playManaDrainFx === 'function') {
            manaFx.playManaDrainFx(drainEvent, { broadcast: broadcastFx });
          } else {
            const animate = window.animateManaSteal || window.__ui?.mana?.animateManaSteal;
            if (typeof animate === 'function') animate(drainEvent);
            const notifyDrain = manaFx.showManaDrainMessage || window.__ui?.mana?.showManaDrainMessage;
            if (typeof notifyDrain === 'function') {
              notifyDrain(opponentIndex, actualLoss, { source: 'MESMER_LAPSE' });
            }
          }
        }
      } catch (err) {
        console.warn('[spell] Не удалось обработать визуализацию потери маны:', err);
      }
    } else if (manaLoss > 0) {
      addLog(`${spellTpl.name}: у противника не осталось маны для потери.`);
    } else {
      addLog(`${spellTpl.name}: существо без стоимости маны не отняло ресурс у противника.`);
    }
  }

  let spellHandIndex = pending.handIndex;
  if (spellHandIndex == null || player.hand?.[spellHandIndex]?.id !== spellTpl.id) {
    spellHandIndex = Array.isArray(player.hand)
      ? player.hand.findIndex(card => card && card.id === spellTpl.id)
      : -1;
  }
  if (spellHandIndex < 0) {
    showNotification('Карта заклинания уже недоступна', 'error');
    cancelMesmerLapseSelection();
    return;
  }

  burnSpellCard(spellTpl, pending.tileMesh || null, pending.cardMesh || null);
  spendAndDiscardSpell(player, spellHandIndex);

  const creatureName = chosenTpl.name || 'Существо';
  addLog(`${spellTpl.name}: ${creatureName} отправлено в сброс.`);

  cancelMesmerLapseSelection();

  refreshPossessionsUI(state);
  updateHand();
  updateUI();
  try {
    if (typeof window !== 'undefined') {
      window.schedulePush?.('spell-mesmer-lapse', { force: true });
    }
  } catch {}
}

// Общая реализация ритуала Holy Feast
function runHolyFeast({ tpl, pl, idx, cardMesh, tileMesh }) {
  const handIndices = pl.hand
    .map((c, i) => (c && c.type === 'UNIT' ? i : -1))
    .filter(i => i >= 0);
  if (handIndices.length === 0) {
    showNotification('No unit in hand for this action', 'error');
    resetCardSelection();
    return;
  }

  // Большая копия заклинания на поле
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  let ritualOrigin = null;
  try {
    const big = window.__cards?.createCard3D(tpl, false);
    if (big) {
      let basePos = null;
      if (tileMesh && typeof tileMesh.position?.clone === 'function') {
        basePos = tileMesh.position.clone();
      } else if (tileMesh && tileMesh.position && THREE && THREE.Vector3) {
        basePos = new THREE.Vector3(tileMesh.position.x || 0, tileMesh.position.y || 0, tileMesh.position.z || 0);
      } else if (THREE && THREE.Vector3) {
        basePos = new THREE.Vector3(0, 0, 0);
      }
      if (basePos && typeof basePos.add === 'function' && THREE && THREE.Vector3) {
        basePos.add(new THREE.Vector3(0, 1.0, 0));
        ritualOrigin = basePos.clone();
        if (typeof big.position?.copy === 'function') big.position.copy(basePos);
      } else {
        ritualOrigin = ritualOrigin || { x: 0, y: 1.0, z: 0 };
        if (basePos && typeof basePos === 'object') {
          ritualOrigin = {
            x: Number(basePos.x) || 0,
            y: (Number(basePos.y) || 0) + 1.0,
            z: Number(basePos.z) || 0,
          };
        }
        try { big.position.set?.(ritualOrigin.x || 0, ritualOrigin.y || 0, ritualOrigin.z || 0); } catch {}
      }
      (ctx.boardGroup || ctx.scene).add(big);
      interactionState.pendingRitualBoardMesh = big;
      interactionState.spellDragHandled = true;
      try { cardMesh.visible = false; } catch {}
      interactionState.pendingRitualSpellHandIndex = idx;
      interactionState.pendingRitualSpellCard = tpl;
    }
  } catch {}
  interactionState.pendingRitualOrigin = ritualOrigin;
  try { if (typeof window !== 'undefined') window.pendingRitualOrigin = ritualOrigin; } catch {}

  // Кнопка отмены возвращает карту в руку
  window.__ui.panels.showPrompt('Select a unit for this action', () => {
    try {
      if (interactionState.pendingRitualBoardMesh && interactionState.pendingRitualBoardMesh.parent)
        interactionState.pendingRitualBoardMesh.parent.remove(interactionState.pendingRitualBoardMesh);
    } catch {}
    interactionState.pendingRitualBoardMesh = null;
    try { cardMesh.visible = true; } catch {}
    interactionState.pendingRitualSpellHandIndex = null;
    interactionState.pendingRitualSpellCard = null;
    interactionState.pendingDiscardSelection = null;
    interactionState.pendingRitualOrigin = null;
    try { if (typeof window !== 'undefined') window.pendingRitualOrigin = null; } catch {}
    updateHand();
    updateUI();
  });

  // Ожидаем выбор существа из руки
  interactionState.pendingDiscardSelection = {
    requiredType: 'UNIT',
    onPicked: handIdx => {
      const toDiscard = discardHandCard(pl, handIdx);
      if (!toDiscard) return;
      const spellIdx = interactionState.pendingRitualSpellHandIndex != null
        ? interactionState.pendingRitualSpellHandIndex
        : pl.hand.indexOf(tpl);
      if (NET_ON()) {
        try { PENDING_HIDE_HAND_CARDS = Array.from(new Set([handIdx, spellIdx])).filter(i => i >= 0); } catch {}
      }
      const before = pl.mana;
      pl.mana = capMana(pl.mana + 2);
      try {
        const baseOrigin = interactionState.pendingRitualOrigin || ritualOrigin;
        let originVec = null;
        if (baseOrigin && typeof baseOrigin.clone === 'function') {
          originVec = baseOrigin.clone();
        } else if (baseOrigin && typeof baseOrigin === 'object' && THREE && THREE.Vector3) {
          originVec = new THREE.Vector3(baseOrigin.x || 0, baseOrigin.y || 0, baseOrigin.z || 0);
        } else if (THREE && THREE.Vector3) {
          originVec = new THREE.Vector3(0, 1.0, 0);
        }
        if (originVec) {
          animateManaGainFromWorld(originVec, gameState.active, { amount: 2, visualOnly: true });
        }
      } catch {}
      try { window.__ui?.mana?.animateTurnManaGain(gameState.active, before, pl.mana, 800); } catch {}
      if (spellIdx >= 0) pl.hand.splice(spellIdx, 1);
      try {
        pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : [];
        pl.graveyard.push(tpl);
      } catch {}
      try {
        if (interactionState.pendingRitualBoardMesh) {
          window.__fx.dissolveAndAsh(interactionState.pendingRitualBoardMesh, new THREE.Vector3(0, 0.6, 0), 0.9);
          setTimeout(() => {
            try { interactionState.pendingRitualBoardMesh.parent.remove(interactionState.pendingRitualBoardMesh); } catch {}
            interactionState.pendingRitualBoardMesh = null;
          }, 950);
        }
      } catch {}
      window.__ui.panels.hidePrompt();
      interactionState.pendingRitualSpellHandIndex = null;
      interactionState.pendingRitualSpellCard = null;
      interactionState.pendingDiscardSelection = null;
      interactionState.pendingRitualOrigin = null;
      try { if (typeof window !== 'undefined') window.pendingRitualOrigin = null; } catch {}
      resetCardSelection();
      updateHand();
      updateUI();
      schedulePush('spell-holy-feast', { force: true });
      if (NET_ON()) {
        try {
          if (typeof window !== 'undefined' && window.socket) {
            window.socket.emit('ritualResolve', {
              kind: 'HOLY_FEAST',
              by: gameState.active,
              card: tpl.id,
              consumed: toDiscard.id,
            });
            window.socket.emit('holyFeast', { seat: gameState.active, spellIdx, creatureIdx: handIdx });
          }
        } catch {}
      }
    },
  };
  addLog(`${tpl.name}: выберите существо в руке для ритуального сброса.`);
}

// Возвращает список целей Healing Shower с рассчитанным итоговым здоровьем
export function collectHealingShowerTargets(state, ownerIdx, elementToken) {
  const normalized = typeof elementToken === 'string' ? elementToken.toUpperCase() : null;
  if (!normalized || !state || !Array.isArray(state.board)) return [];
  const result = [];
  for (let row = 0; row < state.board.length; row++) {
    const rowCells = state.board[row];
    if (!Array.isArray(rowCells)) continue;
    for (let col = 0; col < rowCells.length; col++) {
      const cell = rowCells[col];
      const unit = cell?.unit;
      if (!unit || unit.owner !== ownerIdx) continue;
      const tplUnit = CARDS?.[unit.tplId];
      if (!tplUnit) continue;
      const unitElement = String(tplUnit.element || '').toUpperCase();
      if (unitElement !== normalized) continue;
      const currentHpRaw = Number.isFinite(unit.currentHP)
        ? unit.currentHP
        : Number(unit.currentHP) || (tplUnit.hp || 0);
      const bonusHp = Number.isFinite(unit.bonusHP)
        ? unit.bonusHP
        : Number(unit.bonusHP) || 0;
      const baseHpTpl = Number.isFinite(tplUnit.hp) ? tplUnit.hp : currentHpRaw;
      const buff = computeCellBuff(cell?.element ?? null, tplUnit.element);
      const buffHp = Number.isFinite(buff?.hp) ? buff.hp : Number(buff?.hp) || 0;
      const maxHpCandidate = baseHpTpl + buffHp + bonusHp;
      const maxHp = Math.max(currentHpRaw, maxHpCandidate);
      const after = Math.min(maxHp, currentHpRaw + 3);
      const healed = Math.max(0, after - currentHpRaw);
      if (healed <= 0) continue;
      result.push({ row, col, healed, before: currentHpRaw, after, tpl: tplUnit });
    }
  }
  return result;
}

function cancelTeleportationSelection() {
  interactionState.pendingSpellTeleportation = null;
  clearHighlights();
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function highlightTeleportationTargets(owner, excludePos) {
  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state?.board) {
    clearHighlights();
    return 0;
  }
  const cells = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (excludePos && r === excludePos.r && c === excludePos.c) continue;
      const unit = state.board?.[r]?.[c]?.unit;
      if (unit && (owner == null || unit.owner === owner)) {
        cells.push({ r, c });
      }
    }
  }
  highlightTiles(cells);
  return cells.length;
}

function finalizeTeleportationTarget(targetR, targetC, opts = {}) {
  const pending = interactionState.pendingSpellTeleportation;
  if (!pending) return false;

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    cancelTeleportationSelection();
    return false;
  }

  const activeIndex = typeof state.active === 'number' ? state.active : null;
  const player = opts.pl || (activeIndex != null ? state.players?.[activeIndex] : null);
  const handIndex = (opts.idx != null) ? opts.idx : pending.handIndex;
  const spellTpl = opts.tpl || (player?.hand?.[handIndex] ?? null);

  if (!player || !spellTpl || spellTpl.id !== pending.spellId) {
    showNotification('Заклинание недоступно', 'error');
    cancelTeleportationSelection();
    return true;
  }

  if (pending.first.r === targetR && pending.first.c === targetC) {
    showNotification('Нужно выбрать другое существо', 'error');
    highlightTeleportationTargets(pending.first.owner ?? activeIndex, pending.first);
    return true;
  }

  const firstCell = state.board?.[pending.first.r]?.[pending.first.c];
  const secondCell = state.board?.[targetR]?.[targetC];
  const firstUnit = firstCell?.unit || null;
  const secondUnit = secondCell?.unit || null;

  if (!firstUnit || !secondUnit) {
    showNotification('Цели недоступны', 'error');
    cancelTeleportationSelection();
    return true;
  }
  if (firstUnit.owner !== activeIndex || secondUnit.owner !== activeIndex) {
    showNotification('Можно перемещать только союзников', 'error');
    return true;
  }
  if (pending.first.uid != null && firstUnit.uid !== pending.first.uid) {
    showNotification('Исходная цель изменилась', 'error');
    cancelTeleportationSelection();
    return true;
  }

  const firstPos = { r: pending.first.r, c: pending.first.c };
  state.board[firstPos.r][firstPos.c].unit = secondUnit;
  state.board[targetR][targetC].unit = firstUnit;

  const effectTile = opts.tileMesh || getTileMeshAt(targetR, targetC) || getTileMeshAt(firstPos.r, firstPos.c) || null;

  cancelTeleportationSelection();

  const nameA = CARDS[firstUnit.tplId]?.name || 'Существо';
  const nameB = CARDS[secondUnit.tplId]?.name || 'Существо';
  addLog(`${spellTpl.name}: ${nameA} и ${nameB} меняются местами.`);

  burnSpellCard(spellTpl, effectTile, opts.cardMesh);
  spendAndDiscardSpell(player, handIndex);
  updateHand();
  refreshPossessionsUI(state);
  updateUnits();
  updateUI();
  return true;
}

function cancelTelekinesisSelection() {
  interactionState.pendingSpellTelekinesis = null;
  clearHighlights();
  try { window.__ui?.panels?.hidePrompt?.(); } catch {}
  try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
}

function collectEmptyBoardCells(state) {
  const cells = [];
  if (!state?.board) return cells;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const cell = state.board?.[r]?.[c];
      if (cell && !cell.unit) cells.push({ r, c });
    }
  }
  return cells;
}

function finalizeTelekinesisTarget(targetR, targetC, opts = {}) {
  const pending = interactionState.pendingSpellTelekinesis;
  if (!pending) return false;

  const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) {
    cancelTelekinesisSelection();
    return false;
  }

  const activeIndex = typeof state.active === 'number' ? state.active : null;
  const player = opts.pl || (activeIndex != null ? state.players?.[activeIndex] : null);
  const handIndex = (opts.idx != null) ? opts.idx : pending.handIndex;
  const spellTpl = opts.tpl || (player?.hand?.[handIndex] ?? null);

  if (!player || !spellTpl || spellTpl.id !== pending.spellId) {
    showNotification('Заклинание недоступно', 'error');
    cancelTelekinesisSelection();
    return true;
  }

  if (targetR == null || targetC == null) {
    showNotification('Некорректная цель', 'error');
    return true;
  }

  const sourcePos = { r: pending.source.r, c: pending.source.c };
  const fromCell = state.board?.[sourcePos.r]?.[sourcePos.c];
  const toCell = state.board?.[targetR]?.[targetC];
  const unitRef = fromCell?.unit || null;

  if (!unitRef) {
    showNotification('Исходное существо отсутствует', 'error');
    cancelTelekinesisSelection();
    return true;
  }
  if (unitRef.owner !== activeIndex) {
    showNotification('Можно перемещать только союзников', 'error');
    return true;
  }
  if (pending.source.uid != null && unitRef.uid !== pending.source.uid) {
    showNotification('Исходное существо уже перемещено', 'error');
    cancelTelekinesisSelection();
    return true;
  }
  if (toCell?.unit) {
    showNotification('Выбранное поле занято', 'error');
    return true;
  }
  if (sourcePos.r === targetR && sourcePos.c === targetC) {
    showNotification('Выберите другую клетку', 'error');
    return true;
  }

  const fromElement = state.board?.[sourcePos.r]?.[sourcePos.c]?.element || null;
  const toElement = state.board?.[targetR]?.[targetC]?.element || null;

  fromCell.unit = null;
  toCell.unit = unitRef;

  const effectTile = opts.tileMesh || getTileMeshAt(targetR, targetC) || null;

  cancelTelekinesisSelection();

  const tplUnit = CARDS[unitRef.tplId];
  const unitName = tplUnit?.name || 'Существо';
  addLog(`${spellTpl.name}: ${unitName} перемещается на (${targetR + 1},${targetC + 1}).`);

  const shift = tplUnit ? applyFieldTransitionToUnit(unitRef, tplUnit, fromElement, toElement) : null;
  if (shift?.deltaHp) {
    spawnHpShiftText(targetR, targetC, shift.deltaHp);
    const elementLabel = shift.nextElement || 'нейтральном поле';
    const hpLog = shift.deltaHp > 0
      ? `${unitName} усиливается на ${elementLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`
      : `${unitName} теряет силу на ${elementLabel}: HP ${shift.beforeHp}→${shift.afterHp}.`;
    addLog(`${spellTpl.name}: ${hpLog}`);
  }

  let died = false;
  if (tplUnit) {
    const hazard = applyFieldFatalityCheck(unitRef, tplUnit, toElement);
    if (hazard?.dies) {
      const fatalLog = describeFieldFatality(tplUnit, hazard, { name: unitName });
      if (fatalLog) addLog(fatalLog);
    }
    died = (unitRef.currentHP ?? tplUnit.hp ?? 0) <= 0;
    if (died) {
      const deathElement = toElement || state.board?.[targetR]?.[targetC]?.element || null;
      processSpellDeaths([
        { r: targetR, c: targetC, owner: unitRef.owner, tplId: unitRef.tplId, uid: unitRef.uid ?? null, element: deathElement },
      ]);
    }
  }

  burnSpellCard(spellTpl, effectTile, opts.cardMesh);
  spendAndDiscardSpell(player, handIndex);
  updateHand();
  if (!died) {
    refreshPossessionsUI(state);
    updateUnits();
    updateUI();
  } else {
    updateUI();
  }
  return true;
}

export function handlePendingBoardClick({ unitMesh = null, tileMesh = null } = {}) {
  if (interactionState.pendingSpellFieldExchange) {
    const r = tileMesh?.userData?.row ?? unitMesh?.userData?.row ?? null;
    const c = tileMesh?.userData?.col ?? unitMesh?.userData?.col ?? null;
    if (r == null || c == null) {
      showNotification('Нужно выбрать второе поле для обмена', 'error');
      return true;
    }
    const resolvedTile = tileMesh || getTileMeshAt(r, c) || null;
    finalizeFieldExchange(r, c, { tileMesh: resolvedTile });
    return true;
  }
  if (interactionState.pendingSpellTeleportation) {
    const r = unitMesh?.userData?.row ?? null;
    const c = unitMesh?.userData?.col ?? null;
    if (r == null || c == null) {
      showNotification('Нужно выбрать второе союзное существо', 'error');
      return true;
    }
    finalizeTeleportationTarget(r, c, { tileMesh });
    return true;
  }
  if (interactionState.pendingSpellTelekinesis) {
    const r = tileMesh?.userData?.row ?? null;
    const c = tileMesh?.userData?.col ?? null;
    if (r == null || c == null) {
      showNotification('Нужно указать пустое поле', 'error');
      return true;
    }
    finalizeTelekinesisTarget(r, c, { tileMesh });
    return true;
  }
  return false;
}

export const handlers = {
  SPELL_SCIONDAR_INFERNO: {
    onBoard(ctx) {
      startElementalBurst(ctx);
    },
  },

  SPELL_ICE_FLOOD_OF_OKUNADA: {
    onBoard(ctx) {
      startElementalBurst(ctx);
    },
  },

  SPELL_FIST_OF_VERZAR: {
    onBoard(ctx) {
      startElementalBurst(ctx);
    },
  },

  SPELL_WRATHFUL_WINDS_OF_JUNO: {
    onBoard(ctx) {
      startElementalBurst(ctx);
    },
  },

  SPELL_BLINDING_SKIES: {
    onCast(ctx) {
      startElementalBurst(ctx);
    },
    onBoard(ctx) {
      startElementalBurst(ctx);
    },
  },

  SPELL_SCIONS_RIOTOUS_IMPUNITY: {
    onCast(ctx) {
      handleRiotousImpunity(ctx);
    },
    onBoard(ctx) {
      handleRiotousImpunity(ctx);
    },
  },

  SPELL_BEGUILING_FOG: {
    requiresUnitTarget: true,
    onUnit({ cardMesh, unitMesh, tpl }) {
      // Allow rotating any target in any direction via orientation panel
      try {
        interactionState.pendingSpellOrientation = { spellCardMesh: cardMesh, unitMesh };
        addLog(`${tpl.name}: выберите направление для цели.`);
        window.__ui.panels.showOrientationPanel();
        try { window.__ui?.cancelButton?.refreshCancelButton(); } catch {}
      } catch {}
    },
  },

  SPELL_YUGAS_MESMERIZING_FOG: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u, cardMesh, unitMesh }) {
      const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
      if (!state || !u) {
        showNotification('Цель недоступна', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      if (u.owner !== state.active) {
        showNotification('Нужно выбрать союзное существо', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const directions = [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
      ];
      const affected = [];
      for (const dir of directions) {
        const nr = r + dir.dr;
        const nc = c + dir.dc;
        if (nr < 0 || nr >= 3 || nc < 0 || nc >= 3) continue;
        const enemy = state.board?.[nr]?.[nc]?.unit || null;
        if (!enemy || enemy.owner === u.owner) continue;
        const vectorR = r - nr;
        const vectorC = c - nc;
        let away = enemy.facing || 'N';
        if (vectorR === 1 && vectorC === 0) away = 'N';
        else if (vectorR === -1 && vectorC === 0) away = 'S';
        else if (vectorR === 0 && vectorC === 1) away = 'W';
        else if (vectorR === 0 && vectorC === -1) away = 'E';
        enemy.facing = away;
        affected.push({
          name: CARDS?.[enemy.tplId]?.name || 'Существо',
          r: nr,
          c: nc,
          dir: away,
        });
      }

      const targetName = CARDS?.[u.tplId]?.name || 'союзник';
      if (affected.length) {
        const parts = affected.map(info => `${info.name} (${info.r + 1},${info.c + 1})`);
        addLog(`${tpl.name}: ${parts.join(', ')} отворачиваются от ${targetName}.`);
      } else {
        addLog(`${tpl.name}: рядом с ${targetName} нет вражеских существ.`);
      }

      const effectTile = getTileMeshAt(r, c) || (unitMesh ? getTileMeshAt(unitMesh.userData?.row, unitMesh.userData?.col) : null);
      burnSpellCard(tpl, effectTile, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_CLARE_WILS_BANNER: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u || u.owner !== gameState.active) {
        showNotification('Target: friendly unit', 'error');
        return;
      }
      const { unitMeshes, effectsGroup } = getCtx();
      // Temporary attack buff until caster's turn ends
      u.tempAtkBuff = (u.tempAtkBuff || 0) + 2;
      u.tempBuffOwner = gameState.active;
      addLog(`${tpl.name}: ${CARDS[u.tplId].name} получает +2 ATK до конца хода.`);
      const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
      if (tMesh) {
        window.__fx.spawnDamageText(tMesh, `+2`, '#22c55e');
        try {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 0.8, 48),
            new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.0 })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(tMesh.position).add(new THREE.Vector3(0, 0.32, 0));
          effectsGroup.add(ring);
          gsap
            .to(ring.material, { opacity: 0.8, duration: 0.12 })
            .then(() =>
              gsap.to(ring.scale, {
                x: 2.5,
                y: 2.5,
                z: 2.5,
                duration: 0.4,
                ease: 'power2.out',
              })
            )
            .then(() =>
              gsap.to(ring.material, {
                opacity: 0,
                duration: 0.24,
                onComplete: () => effectsGroup.remove(ring),
              })
            );
        } catch {}
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_SUMMONER_MESMERS_ERRAND: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      if (tpl.cost > pl.mana) {
        showNotification('Insufficient mana', 'error');
        resetCardSelection();
        return;
      }
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
      (async () => {
        for (let i = 0; i < 2; i++) {
          const drawnTpl = drawOneNoAdd(gameState, gameState.active);
          if (drawnTpl) {
            refreshInputLockUI();
            await animateDrawnCardToHand(drawnTpl);
            try {
              gameState.players[gameState.active].hand.push(drawnTpl);
            } catch {}
            updateHand();
          }
        }
        addLog(`${tpl.name}: вы добираете 2 карты.`);
        updateUI();
      })();
    },
  },

  SPELL_SUMMONER_MESMERS_LAPSE: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
      if (!state) {
        showNotification('Игра не готова к розыгрышу заклинания', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      if (tpl.cost > pl.mana) {
        showNotification('Недостаточно маны', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      if (interactionState.pendingSpellLapse) {
        showNotification('Сначала завершите текущий выбор карты для жертвы', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      if (interactionState.pendingDiscardSelection) {
        showNotification('Сначала завершите другой выбор карты', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const hand = Array.isArray(pl.hand) ? pl.hand : [];
      const unitIndices = hand
        .map((card, handIdx) => (card && card.type === 'UNIT' ? handIdx : -1))
        .filter(i => i >= 0);
      if (!unitIndices.length) {
        showNotification('В руке нет существ для сброса', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      interactionState.pendingSpellLapse = {
        spellId: tpl.id,
        handIndex: idx,
        tpl,
        player: pl,
        opponentIndex: state.active === 0 ? 1 : 0,
        cardMesh: cardMesh || null,
        tileMesh: tileMesh || null,
      };
      interactionState.spellDragHandled = true;
      if (cardMesh) returnCardToHand(cardMesh);

      interactionState.pendingDiscardSelection = {
        requiredType: 'UNIT',
        forced: true,
        invalidMessage: 'Нужно выбрать карту существа',
        onPicked: pickedIdx => finalizeMesmerLapseDiscard(pickedIdx),
      };

      try {
        window.__ui.panels.showPrompt(
          'Выберите существо в руке для сброса',
          () => {
            cancelMesmerLapseSelection();
            updateUI();
          },
        );
      } catch {}

      addLog(`${tpl.name}: выберите существо в руке для жертвы.`);
      try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
    },
  },

  SPELL_GOGHLIE_ALTAR: {
    onCast({ tpl, pl, idx, cardMesh, tileMesh }) {
      const countUnits = ownerIdx => {
        let n = 0;
        for (let rr = 0; rr < 3; rr++)
          for (let cc = 0; cc < 3; cc++) {
            const un = gameState.board[rr][cc].unit;
            if (un && un.owner !== ownerIdx) n++;
          }
        return n;
      };
      const g0 = countUnits(0),
        g1 = countUnits(1);
      gameState.players[0].mana = capMana(gameState.players[0].mana + g0);
      gameState.players[1].mana = capMana(gameState.players[1].mana + g1);
      for (let rr = 0; rr < 3; rr++)
        for (let cc = 0; cc < 3; cc++) {
          const un = gameState.board[rr][cc].unit;
          if (!un) continue;
          const pos = getCtx().tileMeshes[rr][cc].position
            .clone()
            .add(new THREE.Vector3(0, 1.2, 0));
          animateManaGainFromWorld(pos, un.owner === 0 ? 1 : 0);
        }
      addLog(
        `${tpl.name}: оба игрока получают ману от вражеских существ (P1 +${g0}, P2 +${g1}).`
      );
      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
    },
  },
  SPELL_PARMTETIC_HOLY_FEAST: {
    onBoard: runHolyFeast,
    onUnit: runHolyFeast,
  },

  WIND_SHIFT: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, u }) {
      if (u) u.facing = turnCW[u.facing];
      addLog(`${tpl.name}: ${CARDS[u.tplId].name} повёрнут.`);
      refreshPossessionsUI(gameState);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  FREEZE_STREAM: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (u) {
        const before = u.currentHP;
        u.currentHP = Math.max(0, u.currentHP - 1);
        addLog(
          `${tpl.name}: ${CARDS[u.tplId].name} получает 1 урона (HP ${before}→${u.currentHP})`
        );
        try {
          const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
          if (tMesh) window.__fx.spawnDamageText(tMesh, `-1`, '#ef4444');
        } catch {}
        if (u.currentHP <= 0) {
          const owner = u.owner;
          const deathElement = gameState.board?.[r]?.[c]?.element || null;
          const deathInfo = [{ r, c, owner, tplId: u.tplId, uid: u.uid ?? null, element: deathElement }];
          try { gameState.players[owner].graveyard.push(CARDS[u.tplId]); } catch {}
          const pos = getCtx().tileMeshes[r][c].position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const slot = gameState.players?.[owner]?.mana || 0;
          animateManaGainFromWorld(pos, owner, true, slot);
          const unitMeshesCtx = getCtx().unitMeshes;
          if (unitMeshesCtx) {
            const unitMesh = unitMeshesCtx.find(m => m.userData.row === r && m.userData.col === c);
            if (unitMesh) {
              window.__fx.dissolveAndAsh(unitMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
            }
          }
          gameState.board[r][c].unit = null;
          const discardEffects = applyDeathDiscardEffects(gameState, deathInfo, { cause: 'SPELL' });
          if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
            for (const text of discardEffects.logs) {
              addLog(text);
            }
          }
          setTimeout(() => {
            refreshPossessionsUI(gameState);
            updateUnits();
            updateUI();
          }, 1000);
        }
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_HEALING_SHOWER: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, r, c, u }) {
      if (!u) {
        showNotification('Need to drag this card to a unit', 'error');
        return;
      }
      if (u.owner !== gameState.active) {
        showNotification('Only friendly unit', 'error');
        return;
      }
      const ctx = getCtx();
      const { unitMeshes, THREE } = ctx;
      const tplTarget = CARDS[u.tplId];
      const chosenElementRaw = tplTarget?.element || null;
      if (!chosenElementRaw) {
        showNotification('Target must have an element', 'error');
        return;
      }
      const chosenElement = String(chosenElementRaw).toUpperCase();
      const healingPlan = collectHealingShowerTargets(gameState, gameState.active, chosenElement);
      for (const info of healingPlan) {
        const unitCell = gameState.board?.[info.row]?.[info.col];
        const unitRef = unitCell?.unit;
        if (!unitRef) continue;
        unitRef.currentHP = info.after;
        try {
          const mesh = unitMeshes?.find(m => m.userData.row === info.row && m.userData.col === info.col);
          if (mesh) {
            window.__fx.spawnDamageText(mesh, `+${info.healed}`, '#22c55e');
            if (THREE && THREE.Vector3) {
              const pulse = window.__fx?.spawnHealingPulse?.(mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
              if (pulse?.disposeLater) pulse.disposeLater(0.9);
            }
          }
        } catch {}
      }
      if (!healingPlan.length) {
        addLog(`${tpl.name}: союзники стихии ${chosenElement} уже на максимуме HP.`);
      } else {
        for (const info of healingPlan) {
          addLog(
            `${tpl.name}: ${info.tpl.name} восстанавливает ${info.healed} HP (HP ${info.before}→${info.after}).`
          );
        }
      }
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_FISSURES_OF_GOGHLIE: {
    onBoard({ tpl, pl, idx, tileMesh }) {
      if (!tileMesh) {
        showNotification('Drag this card to a board cell', 'error');
        return;
      }
      const r = tileMesh.userData.row,
        c = tileMesh.userData.col;
      const cell = gameState.board[r][c];
      if (!cell) return;
      const locked = computeFieldquakeLockedCells(gameState);
      if (locked.some(p => p.r === r && p.c === c)) {
        showNotification('This field is protected', 'error');
        return;
      }
      if (cell.element === 'BIOLITH') {
        showNotification("This cell can't be changed", 'error');
        return;
      }
      const oppMap = {
        FIRE: 'WATER',
        WATER: 'FIRE',
        EARTH: 'FOREST',
        FOREST: 'EARTH',
      };
      const prevEl = cell.element;
      const nextEl = oppMap[prevEl] || prevEl;
      cell.element = nextEl;
      refreshPossessionsUI(gameState);
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      playFieldquakeFx(
        { r, c, prevElement: prevEl, nextElement: nextEl },
        { broadcast: broadcastFx },
      );
      const u = gameState.board[r][c].unit;
      if (u) {
        const tplUnit = CARDS[u.tplId];
        const prevBuff = computeCellBuff(prevEl, tplUnit.element);
        const nextBuff = computeCellBuff(nextEl, tplUnit.element);
        const deltaHp = (nextBuff.hp || 0) - (prevBuff.hp || 0);
        if (deltaHp !== 0) {
          const before = u.currentHP;
          u.currentHP = Math.max(0, before + deltaHp);
          const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
          if (tMesh)
            window.__fx.spawnDamageText(
              tMesh,
              `${deltaHp > 0 ? '+' : ''}${deltaHp}`,
              deltaHp > 0 ? '#22c55e' : '#ef4444'
            );
          if (u.currentHP <= 0) {
            const deathElement = gameState.board?.[r]?.[c]?.element || null;
            const deathInfo = [{ r, c, owner: u.owner, tplId: u.tplId, uid: u.uid ?? null, element: deathElement }];
            try { gameState.players[u.owner].graveyard.push(CARDS[u.tplId]); } catch {}
            const deadMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (deadMesh) {
              window.__fx.dissolveAndAsh(deadMesh, new THREE.Vector3(0, 0, 0.6), 0.9);
              gameState.board[r][c].unit = null;
              const discardEffects = applyDeathDiscardEffects(gameState, deathInfo, { cause: 'SPELL' });
              if (Array.isArray(discardEffects.logs) && discardEffects.logs.length) {
                for (const text of discardEffects.logs) addLog(text);
              }
              setTimeout(() => {
                refreshPossessionsUI(gameState);
                updateUnits();
                updateUI();
              }, 1000);
            }
          }
        }
      }
      burnSpellCard(tpl, tileMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUnits();
      updateUI();
    },
  },

  SPELL_TINOAN_TELEPORTATION: {
    requiresUnitTarget: true,
    onUnit({ tpl, pl, idx, cardMesh, unitMesh, u }) {
      const r = unitMesh?.userData?.row ?? null;
      const c = unitMesh?.userData?.col ?? null;
      if (r == null || c == null || !u) {
        showNotification('Нужно навести карту на союзное существо', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
      if (!state) {
        showNotification('Игра не готова к обработке заклинания', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      if (u.owner !== state.active) {
        showNotification('Можно выбрать только союзное существо', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const pending = interactionState.pendingSpellTeleportation;
      if (!pending) {
        const count = highlightTeleportationTargets(u.owner, { r, c });
        if (!count) {
          showNotification('Других союзных существ для обмена нет', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          clearHighlights();
          return;
        }
        interactionState.pendingSpellTeleportation = {
          spellId: tpl.id,
          handIndex: idx,
          first: { r, c, uid: u.uid ?? null, tplId: u.tplId, owner: u.owner },
        };
        if (cardMesh) {
          interactionState.spellDragHandled = true;
          returnCardToHand(cardMesh);
        }
        try {
          window.__ui.panels.showPrompt(
            'Выберите второе союзное существо для обмена позициями',
            () => {
              cancelTeleportationSelection();
              updateUI();
            },
          );
        } catch {}
        addLog(`${tpl.name}: выберите второе союзное существо для обмена местами.`);
        try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
        return;
      }

      if (pending.spellId !== tpl.id || pending.handIndex !== idx) {
        showNotification('Сначала завершите текущее заклинание', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      finalizeTeleportationTarget(r, c, { tpl, pl, idx, cardMesh });
    },
  },

  SPELL_TINOAN_TELEKINESIS: {
    onBoard({ tpl, pl, idx, cardMesh, unitMesh, tileMesh }) {
      const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
      if (!state) {
        showNotification('Игра не готова к обработке заклинания', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const pending = interactionState.pendingSpellTelekinesis;

      if (!pending) {
        const r = unitMesh?.userData?.row ?? null;
        const c = unitMesh?.userData?.col ?? null;
        const unitRef = (r != null && c != null) ? state.board?.[r]?.[c]?.unit : null;
        if (r == null || c == null || !unitRef) {
          showNotification('Сначала выберите союзное существо', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        if (unitRef.owner !== state.active) {
          showNotification('Можно выбрать только союзное существо', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        const emptyCells = collectEmptyBoardCells(state);
        if (!emptyCells.length) {
          showNotification('Нет свободных клеток для перемещения', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        interactionState.pendingSpellTelekinesis = {
          spellId: tpl.id,
          handIndex: idx,
          source: { r, c, uid: unitRef.uid ?? null, tplId: unitRef.tplId },
        };
        if (cardMesh) {
          interactionState.spellDragHandled = true;
          returnCardToHand(cardMesh);
        }
        highlightTiles(emptyCells);
        try {
          window.__ui.panels.showPrompt(
            'Выберите пустое поле для перемещения союзного существа',
            () => {
              cancelTelekinesisSelection();
              updateUI();
            },
          );
        } catch {}
        addLog(`${tpl.name}: выберите пустое поле для перемещения выбранного союзника.`);
        try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
        return;
      }

      if (pending.spellId !== tpl.id || pending.handIndex !== idx) {
        showNotification('Сначала завершите текущее перемещение', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const targetR = tileMesh?.userData?.row ?? null;
      const targetC = tileMesh?.userData?.col ?? null;
      if (targetR == null || targetC == null) {
        showNotification('Нужно указать пустое поле', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      finalizeTelekinesisTarget(targetR, targetC, { tpl, pl, idx, cardMesh, tileMesh });
    },
  },

  SPELL_GREAT_TOLICORE_QUAKE: {
    onBoard({ tpl, pl, idx, tileMesh, cardMesh }) {
      if (!tileMesh) {
        showNotification('Нужно выбрать поле с нужной стихией', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      const r = tileMesh.userData?.row ?? null;
      const c = tileMesh.userData?.col ?? null;
      if (r == null || c == null) {
        showNotification('Некорректная цель', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }
      const cell = gameState.board?.[r]?.[c];
      if (!cell) return;
      const element = cell.element;
      if (!element || element === 'BIOLITH') {
        showNotification('Выберите поле огня, воды, земли или леса', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const targets = [];
      for (let rr = 0; rr < 3; rr += 1) {
        for (let cc = 0; cc < 3; cc += 1) {
          if (gameState.board?.[rr]?.[cc]?.element === element) targets.push({ r: rr, c: cc });
        }
      }

      const fqResult = performFieldquakeAcrossBoard(gameState, targets, { sourceName: tpl.name });
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      if (fqResult.events.length) {
        playFieldquakeFxBatch(fqResult.events, { broadcast: broadcastFx });
      }
      if (!fqResult.events.length) {
        addLog(`${tpl.name}: защищённые или биолитовые поля препятствуют эффекту.`);
      }
      for (const text of fqResult.logs) addLog(text);

      refreshPossessionsUI(gameState);
      updateUnits();
      updateUI();
      if (fqResult.deaths.length) {
        processSpellDeaths(fqResult.deaths);
      }

      burnSpellCard(tpl, tileMesh, cardMesh);
      spendAndDiscardSpell(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
    },
  },

  SPELL_SEER_VIZAKS_CALAMITY: {
    onCast({ tpl, pl, idx, cardMesh }) {
      const positions = [];
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          positions.push({ r, c });
        }
      }

      const fqResult = performFieldquakeAcrossBoard(gameState, positions, { sourceName: tpl.name });
      const broadcastFx = (typeof NET_ON === 'function' ? NET_ON() : false)
        && typeof MY_SEAT === 'number'
        && typeof gameState?.active === 'number'
        && MY_SEAT === gameState.active;
      if (fqResult.events.length) {
        playFieldquakeFxBatch(fqResult.events, { broadcast: broadcastFx });
      }
      if (!fqResult.events.length) {
        addLog(`${tpl.name}: подходящих полей для fieldquake не найдено.`);
      }
      for (const text of fqResult.logs) addLog(text);

      refreshPossessionsUI(gameState);
      updateUnits();
      updateUI();
      if (fqResult.deaths.length) {
        processSpellDeaths(fqResult.deaths);
      }

      burnSpellCard(tpl, null, cardMesh);
      offerSpellToEye(pl, idx);
      resetCardSelection();
      updateHand();
      updateUI();
      addLog(`${tpl.name}: карта принесена Оку, ход завершается.`);

      setTimeout(() => {
        try { window.__ui?.actions?.endTurn?.(); } catch {}
      }, 350);
    },
  },

  SPELL_CALL_OF_TIMELESS_JUNO: {
    onBoard({ tpl, pl, idx, tileMesh, unitMesh, cardMesh }) {
      const state = typeof gameState !== 'undefined' ? gameState : (typeof window !== 'undefined' ? window.gameState : null);
      if (!state) {
        showNotification('Игра не готова к обработке заклинания', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const r = tileMesh?.userData?.row ?? unitMesh?.userData?.row ?? null;
      const c = tileMesh?.userData?.col ?? unitMesh?.userData?.col ?? null;
      if (r == null || c == null) {
        showNotification('Нужно выбрать поле на арене', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const pending = interactionState.pendingSpellFieldExchange;
      if (!pending) {
        if (tpl.cost > pl.mana) {
          showNotification('Недостаточно маны', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        const cell = state.board?.[r]?.[c];
        if (!cell || !cell.element) {
          showNotification('Поле недоступно', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        const lockedSet = buildLockedFieldSet(state);
        if (lockedSet.has(`${r},${c}`)) {
          showNotification('Это поле защищено от обмена', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          return;
        }
        const available = highlightFieldExchangeTargets({ r, c });
        if (!available) {
          showNotification('Нет доступных полей для обмена', 'error');
          if (cardMesh) returnCardToHand(cardMesh);
          clearHighlights();
          return;
        }
        interactionState.pendingSpellFieldExchange = {
          spellId: tpl.id,
          handIndex: idx,
          first: { r, c },
          tpl,
          cardMesh: cardMesh || null,
        };
        interactionState.spellDragHandled = true;
        if (cardMesh) returnCardToHand(cardMesh);
        try {
          window.__ui.panels.showPrompt(
            'Выберите второе поле для обмена',
            () => {
              cancelFieldExchangeSelection();
              updateUI();
            },
          );
        } catch {}
        addLog(`${tpl.name}: выберите второе поле, которое нужно обменять.`);
        try { window.__ui?.cancelButton?.refreshCancelButton?.(); } catch {}
        return;
      }

      if (pending.spellId !== tpl.id || pending.handIndex !== idx) {
        showNotification('Сначала завершите текущий обмен полей', 'error');
        if (cardMesh) returnCardToHand(cardMesh);
        return;
      }

      const resolvedTile = tileMesh || (typeof r === 'number' && typeof c === 'number' ? getTileMeshAt(r, c) : null);
      finalizeFieldExchange(r, c, { tpl, pl, idx, tileMesh: resolvedTile, cardMesh });
    },
  },
};

export function requiresUnitTarget(id) {
  return handlers[id]?.requiresUnitTarget;
}

export function castSpellOnUnit(ctx) {
  const h = handlers[ctx.tpl.id];
  if (h?.onUnit) {
    h.onUnit(ctx);
    return true;
  }
  return false;
}

export function castSpellByDrag(ctx) {
  const h = handlers[ctx.tpl.id];
  if (!h) return false;
  if (h.onBoard) {
    h.onBoard(ctx);
    return true;
  }
  if (h.onCast) {
    h.onCast(ctx);
    return true;
  }
  return false;
}

const api = {
  handlers,
  castSpellOnUnit,
  castSpellByDrag,
  requiresUnitTarget,
  handlePendingBoardClick,
  cancelFieldExchangeSelection,
  cancelMesmerLapseSelection,
};
try {
  if (typeof window !== 'undefined') {
    window.__spells = api;
  }
} catch {}

export default api;
