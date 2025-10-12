// Units rendering on the board
import { getCtx } from './context.js';
import { createCard3D, drawCardFace, isCardIllustrationReady, ensureCardIllustration } from './cards.js';
import { renderFieldLocks } from './fieldlocks.js';
import { isUnitPossessed, hasInvisibility, getUnitProtection } from '../core/abilities.js';
import { attachPossessionOverlay, disposePossessionOverlay } from './possessionOverlay.js';
import { setInvisibilityFx } from './unitFx.js';
import { resetUnitHover } from './unitTooltip.js';
import { spawnProtectionPopup } from './effects.js';

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

// --- Вспомогательные функции для подбора шаблона карты ---
const CARD_NAME_INDEX = { map: null, source: null };

function getCardsDatabase() {
  try {
    if (typeof window !== 'undefined' && window.CARDS && typeof window.CARDS === 'object') {
      return window.CARDS;
    }
  } catch {}
  return null;
}

function normalizeNameKey(name) {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_');
}

function getCardByName(name, cardsDb) {
  if (!cardsDb) return null;
  const key = normalizeNameKey(name);
  if (!key) return null;
  if (!CARD_NAME_INDEX.map || CARD_NAME_INDEX.source !== cardsDb) {
    CARD_NAME_INDEX.map = new Map();
    CARD_NAME_INDEX.source = cardsDb;
    for (const card of Object.values(cardsDb)) {
      const cardNameKey = normalizeNameKey(card?.name);
      if (cardNameKey && !CARD_NAME_INDEX.map.has(cardNameKey)) {
        CARD_NAME_INDEX.map.set(cardNameKey, card);
      }
    }
  }
  return CARD_NAME_INDEX.map.get(key) || null;
}

function toFiniteNumber(...values) {
  for (const value of values) {
    if (value == null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function collectIdCandidates(target, list) {
  if (!target) return;
  const push = (val) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed || list.includes(trimmed)) return;
    list.push(trimmed);
  };
  if (typeof target === 'string') {
    push(target);
    return;
  }
  if (typeof target !== 'object') return;
  push(target.tplId);
  push(target.id);
  push(target.cardId);
  push(target.templateId);
  push(target.legacyId);
}

function collectNameCandidates(target, list) {
  if (!target) return;
  const push = (val) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed || list.includes(trimmed)) return;
    list.push(trimmed);
  };
  if (typeof target === 'string') return;
  if (typeof target.name === 'string') push(target.name);
}

function resolveCardDataForUnit(unit) {
  if (!unit) return null;
  const cardsDb = getCardsDatabase();
  const idCandidates = [];
  const nameCandidates = [];
  const objectCandidates = [];

  const addObjectCandidate = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    objectCandidates.push(obj);
  };

  collectIdCandidates(unit.tplId, idCandidates);
  collectIdCandidates(unit.id, idCandidates);
  collectIdCandidates(unit.cardId, idCandidates);
  collectIdCandidates(unit.templateId, idCandidates);
  if (typeof unit.name === 'string') nameCandidates.push(unit.name.trim());

  if (unit.card) {
    collectIdCandidates(unit.card, idCandidates);
    collectNameCandidates(unit.card, nameCandidates);
    if (typeof unit.card === 'object') addObjectCandidate(unit.card);
  }
  if (unit.tpl) {
    collectIdCandidates(unit.tpl, idCandidates);
    collectNameCandidates(unit.tpl, nameCandidates);
    addObjectCandidate(unit.tpl);
  }
  if (unit.template) {
    collectIdCandidates(unit.template, idCandidates);
    collectNameCandidates(unit.template, nameCandidates);
    addObjectCandidate(unit.template);
  }
  if (unit.cardData) {
    collectIdCandidates(unit.cardData, idCandidates);
    collectNameCandidates(unit.cardData, nameCandidates);
    addObjectCandidate(unit.cardData);
  }

  if (cardsDb) {
    for (const id of idCandidates) {
      if (cardsDb[id]) return cardsDb[id];
      const upper = id.toUpperCase();
      if (upper !== id && cardsDb[upper]) return cardsDb[upper];
      const lower = id.toLowerCase();
      if (lower !== id && cardsDb[lower]) return cardsDb[lower];
    }
    for (const name of nameCandidates) {
      const foundByName = getCardByName(name, cardsDb);
      if (foundByName) return foundByName;
    }
  }

  for (const candidate of objectCandidates) {
    if (candidate && typeof candidate === 'object') {
      return { ...candidate };
    }
  }

  if (!idCandidates.length && !nameCandidates.length) {
    return null;
  }

  const fallbackId = idCandidates[0] || null;
  const fallbackName = nameCandidates[0] || fallbackId || 'Неизвестная карта';
  const cost = toFiniteNumber(unit.card?.cost, unit.cost, unit.baseCost) ?? 0;
  const activation = toFiniteNumber(unit.card?.activation, unit.activation);
  const atk = toFiniteNumber(unit.card?.atk, unit.atk, unit.baseAtk, unit.currentAtk);
  const hp = toFiniteNumber(unit.card?.hp, unit.hp, unit.baseHp, unit.currentHP);
  const element = (typeof unit.element === 'string' && unit.element.trim())
    ? unit.element.trim()
    : (typeof unit.card?.element === 'string' ? unit.card.element : 'NEUTRAL');
  const desc = typeof unit.card?.desc === 'string'
    ? unit.card.desc
    : (typeof unit.card?.text === 'string' ? unit.card.text : '');

  const fallback = {
    id: fallbackId || fallbackName || 'UNKNOWN_CARD',
    name: fallbackName || 'Неизвестная карта',
    type: 'UNIT',
    cost,
    activation: activation != null ? activation : Math.max(0, cost - 1),
    atk: atk != null ? atk : 0,
    hp: hp != null ? hp : 0,
    element,
    desc,
  };
  if (Array.isArray(unit.attacks)) fallback.attacks = unit.attacks.slice();
  else if (Array.isArray(unit.card?.attacks)) fallback.attacks = unit.card.attacks.slice();
  if (Array.isArray(unit.blindspots)) fallback.blindspots = unit.blindspots.slice();
  else if (Array.isArray(unit.card?.blindspots)) fallback.blindspots = unit.card.blindspots.slice();

  return fallback;
}

function updateCardTexture(mesh, cardData, hpValue, atkValue, opts = {}) {
  try {
    const material = Array.isArray(mesh.material) ? mesh.material[2] : mesh.material;
    const texture = material?.map;
    const canvas = texture?.image;
    const ctx2d = canvas?.getContext?.('2d');
    if (!ctx2d || !canvas) return;
    drawCardFace(ctx2d, cardData, canvas.width, canvas.height, hpValue, atkValue, opts);
    texture.needsUpdate = true;
    const overlay = mesh.children?.find(ch => ch.userData?.kind === 'faceOverlay');
    if (overlay?.material?.map) overlay.material.map.needsUpdate = true;
  } catch {}
}

// Уникально идентифицируем иллюстрацию, чтобы не подписываться повторно
function getCardArtKey(cardData) {
  if (!cardData || typeof cardData !== 'object') return null;
  const direct = typeof cardData.id === 'string' && cardData.id.trim();
  if (direct) return direct.trim();
  const tplId = typeof cardData.tplId === 'string' && cardData.tplId.trim();
  if (tplId) return tplId.trim();
  const legacy = typeof cardData.cardId === 'string' && cardData.cardId.trim();
  if (legacy) return legacy.trim();
  const name = typeof cardData.name === 'string' && cardData.name.trim();
  return name ? name.trim() : null;
}

// Подписываемся на загрузку иллюстрации конкретной карты и обновляем её текстуру на поле
function scheduleIllustrationRefresh(mesh, cardData) {
  if (!mesh || !cardData) return;
  const key = getCardArtKey(cardData);
  if (!key) return;
  mesh.userData = mesh.userData || {};
  const existing = mesh.userData.pendingArtRefresh;
  if (existing && existing.key === key && existing.unitUid === mesh.userData.unitUid) {
    return;
  }
  const pending = { key, unitUid: mesh.userData.unitUid, onLoad: null, onError: null };
  const onLoad = () => {
    try {
      const data = mesh.userData || {};
      if (!data || data.unitUid !== pending.unitUid) return;
      updateCardTexture(mesh, data.cardData || cardData, data.lastHp, data.lastAtk, {
        activationOverride: data.lastActivation,
      });
    } finally {
      try {
        if (mesh.userData && mesh.userData.pendingArtRefresh?.key === key && mesh.userData.pendingArtRefresh?.unitUid === mesh.userData.unitUid) {
          mesh.userData.pendingArtRefresh = null;
        }
      } catch {}
    }
  };
  const onError = () => {
    try {
      if (mesh.userData && mesh.userData.pendingArtRefresh?.key === key && mesh.userData.pendingArtRefresh?.unitUid === mesh.userData.unitUid) {
        mesh.userData.pendingArtRefresh = null;
      }
    } catch {}
  };
  pending.onLoad = onLoad;
  pending.onError = onError;
  mesh.userData.pendingArtRefresh = pending;
  ensureCardIllustration(cardData, { onLoad, onError });
}

// Сбрасываем отложенный запрос на перерисовку иллюстрации
function clearIllustrationRefresh(mesh) {
  try {
    if (mesh?.userData) {
      mesh.userData.pendingArtRefresh = null;
    }
  } catch {}
}

function ensureGlow(mesh, owner, THREE) {
  if (!mesh) return;
  const colorValue = owner === 0 ? 0x22c55e : 0xef4444;
  const color = new THREE.Color(colorValue);
  let glow = mesh.userData?.ownerGlow;
  if (!glow) {
    const glowMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.3,
    });
    const glowGeometry = new THREE.BoxGeometry(1.8, 0.02, 2.4);
    glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(0, -0.05, 0);
    mesh.add(glow);
    mesh.userData = mesh.userData || {};
    mesh.userData.ownerGlow = glow;
  } else {
    const mat = glow.material;
    if (mat) {
      mat.color = color.clone();
      mat.emissive = color.clone();
      mat.needsUpdate = true;
    }
  }
}

function updateFrameHighlight(frame, unit, viewerSeat, THREE) {
  if (!frame) return;
  const setFrame = (opacity, colorValue) => {
    frame.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.opacity = opacity;
        child.material.color = new THREE.Color(colorValue);
      }
    });
  };
  if (unit) {
    const isMine = unit.owner === viewerSeat;
    const col = isMine ? 0x22c55e : 0xef4444;
    setFrame(0.95, col);
  } else {
    setFrame(0.0, 0x000000);
  }
}

function animateToPosition(mesh, target, isNew) {
  if (!mesh) return;
  mesh.userData = mesh.userData || {};
  try {
    const shake = mesh.userData.__shakeTimeline;
    if (shake && typeof shake.kill === 'function') {
      shake.kill();
    }
    mesh.userData.__shakeTimeline = null;
  } catch {}
  const gsap = (typeof window !== 'undefined') ? window.gsap : null;
  const prevTarget = mesh.userData.__targetPosition;
  const sameTarget = prevTarget && Math.abs(prevTarget.x - target.x) < 1e-3 && Math.abs(prevTarget.y - target.y) < 1e-3 && Math.abs(prevTarget.z - target.z) < 1e-3;
  if (isNew) {
    mesh.position.copy(target);
    mesh.userData.__targetPosition = target.clone();
    return;
  }
  if (sameTarget && mesh.userData.__moveTween) {
    return;
  }
  if (mesh.userData.__moveTween && typeof mesh.userData.__moveTween.kill === 'function') {
    mesh.userData.__moveTween.kill();
    mesh.userData.__moveTween = null;
  }
  if (gsap && !sameTarget) {
    mesh.userData.__moveTween = gsap.to(mesh.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 0.38,
      ease: 'power2.out',
      onUpdate: () => { mesh.userData.__targetPosition = target.clone(); },
      onComplete: () => {
        mesh.userData.__moveTween = null;
        mesh.position.set(target.x, target.y, target.z);
        mesh.userData.__targetPosition = target.clone();
      },
    });
  } else {
    mesh.position.copy(target);
    mesh.userData.__targetPosition = target.clone();
  }
}

export function updateUnits(gameState) {
  if (!gameState) return;
  const ctx = getCtx();
  const THREE = getTHREE();
  const { cardGroup } = ctx;
  const effectiveStats = (typeof window !== 'undefined' && window.effectiveStats) || (() => ({ atk: 0, hp: 0 }));
  const facingDeg = (typeof window !== 'undefined' && window.facingDeg) || { N: 0, E: -90, S: 180, W: 90 };
  const viewerSeat = (() => {
    try {
      if (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') {
        return window.MY_SEAT;
      }
    } catch {}
    return gameState.active;
  })();

  const tileSize = 6.2;
  const spacing = 0.2;
  const boardZShift = -3.5;

  const oldMap = ctx.unitMeshesByUid instanceof Map ? ctx.unitMeshesByUid : new Map();
  const nextMap = new Map();
  const usedUids = new Set();
  const newList = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = gameState.board?.[r]?.[c];
      const unit = cell?.unit;
      try { updateFrameHighlight(ctx.tileFrames?.[r]?.[c], unit, viewerSeat, THREE); } catch {}
      if (!unit) continue;

      const cardData = resolveCardDataForUnit(unit) || {};
      // Проверяем готовность иллюстрации, чтобы обновить карточку в момент подгрузки арта
      const artReady = isCardIllustrationReady(cardData);
      const stats = effectiveStats(cell, unit, { state: gameState, r, c });
      const hpValue = typeof unit.currentHP === 'number' ? unit.currentHP : (cardData?.hp || 0);
      const atkValue = stats.atk ?? 0;
      const fieldElement = cell?.element;
      const activationValue = (typeof window !== 'undefined' && typeof window.rotateCost === 'function')
        ? window.rotateCost(cardData, fieldElement, { state: gameState, r, c, unit, owner: unit.owner })
        : ((cardData?.activation != null) ? cardData.activation : Math.max(0, (cardData?.cost || 0) - 1));
      const uid = unit.uid != null ? String(unit.uid) : `${unit.owner}:${unit.tplId}:${r}:${c}`;
      usedUids.add(uid);

      let mesh = oldMap.get(uid);
      const existedBefore = !!mesh;
      if (!mesh) {
        mesh = createCard3D(cardData, false, hpValue, atkValue);
        ensureGlow(mesh, unit.owner, THREE);
        if (isUnitPossessed(unit)) {
          try { attachPossessionOverlay(mesh); } catch {}
        }
        if (cardGroup && mesh.parent !== cardGroup) {
          try { cardGroup.add(mesh); } catch {}
        }
        updateCardTexture(mesh, cardData, hpValue, atkValue, { activationOverride: activationValue });
      } else {
        ensureGlow(mesh, unit.owner, THREE);
        const lastHp = mesh.userData?.lastHp;
        const lastAtk = mesh.userData?.lastAtk;
        const lastActivation = mesh.userData?.lastActivation;
        const prevArtReady = mesh.userData?.artReady === true;
        const statsChanged = lastHp !== hpValue || lastAtk !== atkValue || lastActivation !== activationValue;
        // Если показатели не изменились, но иллюстрация стала доступна, перерисовываем текстуру
        if (statsChanged || (artReady && !prevArtReady)) {
          updateCardTexture(mesh, cardData, hpValue, atkValue, { activationOverride: activationValue });
        }
        if (mesh.parent == null && cardGroup) {
          try { cardGroup.add(mesh); } catch {}
        }
      }

      const protectionValue = Math.max(0, getUnitProtection(gameState, r, c, { unit, tpl: cardData }));
      mesh.userData = mesh.userData || {};
      mesh.userData.artReady = artReady;
      const prevProtection = typeof mesh.userData.lastProtection === 'number' ? mesh.userData.lastProtection : 0;
      const protectionDelta = protectionValue - prevProtection;
      mesh.userData.type = 'unit';
      mesh.userData.row = r;
      mesh.userData.col = c;
      mesh.userData.unitData = unit;
      mesh.userData.cardData = cardData;
      mesh.userData.unitUid = uid;
      mesh.userData.lastHp = hpValue;
      mesh.userData.lastAtk = atkValue;
      mesh.userData.lastActivation = activationValue;
      if (!artReady) {
        scheduleIllustrationRefresh(mesh, cardData);
      } else {
        clearIllustrationRefresh(mesh);
      }

      const targetRotation = (facingDeg[unit.facing] || 0) * Math.PI / 180;
      mesh.rotation.y = targetRotation;

      const x = (c - 1) * (tileSize + spacing);
      const z = (r - 1) * (tileSize + spacing) + boardZShift + 0.0;
      const yBase = (ctx.tileFrames?.[r]?.[c]?.children?.[0]?.position?.y) || (0.5 + 0.5);
      const targetPos = new THREE.Vector3(x, yBase + 0.28, z);
      animateToPosition(mesh, targetPos, !existedBefore);

      if (protectionDelta !== 0) {
        try { spawnProtectionPopup(mesh, protectionDelta, targetPos); } catch {}
      }

      mesh.userData.lastProtection = protectionValue;

      if (isUnitPossessed(unit)) {
        try { attachPossessionOverlay(mesh); } catch {}
      } else {
        try { disposePossessionOverlay(mesh); } catch {}
      }

      const invisible = !!hasInvisibility(gameState, r, c, { unit, tpl: cardData });
      try { setInvisibilityFx(mesh, invisible); } catch {}
      mesh.userData.__invisibilityState = invisible;

      newList.push(mesh);
      nextMap.set(uid, mesh);
    }
  }

  if (oldMap instanceof Map) {
    for (const [uid, mesh] of oldMap.entries()) {
      if (usedUids.has(uid)) continue;
      try { setInvisibilityFx(mesh, false); } catch {}
      try { disposePossessionOverlay(mesh); } catch {}
      try {
        const shake = mesh.userData?.__shakeTimeline;
        if (shake && typeof shake.kill === 'function') {
          shake.kill();
        }
        if (mesh?.userData) mesh.userData.__shakeTimeline = null;
      } catch {}
      try {
        if (mesh.userData?.__moveTween && typeof mesh.userData.__moveTween.kill === 'function') {
          mesh.userData.__moveTween.kill();
          mesh.userData.__moveTween = null;
        }
      } catch {}
      clearIllustrationRefresh(mesh);
      try { if (mesh.parent) mesh.parent.remove(mesh); } catch {}
    }
  }

  ctx.unitMeshes = newList;
  ctx.unitMeshesByUid = nextMap;

  try { if (typeof window !== 'undefined') window.unitMeshes = ctx.unitMeshes; } catch {}

  resetUnitHover();
  try { renderFieldLocks(gameState); } catch {}
}

try { if (typeof window !== 'undefined') window.__units = { updateUnits }; } catch {}

