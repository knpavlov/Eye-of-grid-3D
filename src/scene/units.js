// Units rendering on the board
import { getCtx } from './context.js';
import { createCard3D, drawCardFace } from './cards.js';
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
  const CARDS = (typeof window !== 'undefined' && window.CARDS) || {};
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

      const cardData = CARDS[unit.tplId];
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
        if (lastHp !== hpValue || lastAtk !== atkValue || lastActivation !== activationValue) {
          updateCardTexture(mesh, cardData, hpValue, atkValue, { activationOverride: activationValue });
        }
        if (mesh.parent == null && cardGroup) {
          try { cardGroup.add(mesh); } catch {}
        }
      }

      const protectionValue = Math.max(0, getUnitProtection(gameState, r, c, { unit, tpl: cardData }));
      mesh.userData = mesh.userData || {};
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

