// Units rendering on the board
import { getCtx } from './context.js';
import { createCard3D } from './cards.js';
import { renderFieldLocks } from './fieldlocks.js';
import { isUnitPossessed, hasInvisibility } from '../core/abilities.js';
import { attachPossessionOverlay } from './possessionOverlay.js';
import { applyInvisibilityEffect, removeInvisibilityEffect } from './invisibilityFx.js';

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

export function updateUnits(gameState) {
  const state = gameState || (typeof window !== 'undefined' ? window.gameState : null);
  if (!state) return;
  const ctx = getCtx();
  const THREE = getTHREE();
  const { cardGroup } = ctx;
  const CARDS = (typeof window !== 'undefined' && window.CARDS) || {};
  const effectiveStats = (typeof window !== 'undefined' && window.effectiveStats) || (()=>({ atk:0, hp:0 }));
  const facingDeg = (typeof window !== 'undefined' && window.facingDeg) || { N:0, E:-90, S:180, W:90 };

  // Remove previous unit meshes
  try {
    (ctx.unitMeshes || []).forEach(unit => {
      if (!unit) return;
      try { removeInvisibilityEffect(unit); } catch {}
      if (unit.parent) unit.parent.remove(unit);
    });
  } catch {}
  ctx.unitMeshes = [];

  const tileSize = 6.2; const spacing = 0.2; const boardZShift = -3.5;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const unit = state.board?.[r]?.[c]?.unit;
      // Update frame highlight
      try {
        const frame = ctx.tileFrames?.[r]?.[c];
        if (frame) {
          const setFrame = (opacity, color) => { frame.traverse(child => { if (child.isMesh && child.material) { child.material.opacity = opacity; child.material.color = new THREE.Color(color); } }); };
          if (unit) {
            let viewerSeat = null; try { viewerSeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : state.active; } catch { viewerSeat = state.active; }
            const isMine = (unit.owner === viewerSeat); const col = isMine ? 0x22c55e : 0xef4444; setFrame(0.95, col);
          } else { setFrame(0.0, 0x000000); }
        }
      } catch {}
      if (!unit) continue;

      const cardData = CARDS[unit.tplId];
      const stats = effectiveStats(state.board[r][c], unit);
      const unitMesh = createCard3D(cardData, false, unit.currentHP, stats.atk);

      const x = (c - 1) * (tileSize + spacing);
      const z = (r - 1) * (tileSize + spacing) + boardZShift + 0.0;
      const yBase = (ctx.tileFrames?.[r]?.[c]?.children?.[0]?.position?.y) || (0.5 + 0.5);
      unitMesh.position.set(x, yBase + 0.28, z);
      unitMesh.rotation.y = (facingDeg[unit.facing] || 0) * Math.PI / 180;

      const ownerColor = unit.owner === 0 ? 0x22c55e : 0xef4444;
      const glowMaterial = new THREE.MeshStandardMaterial({ color: ownerColor, emissive: ownerColor, emissiveIntensity: 0.2, transparent: true, opacity: 0.3 });
      const glowGeometry = new THREE.BoxGeometry(1.8, 0.02, 2.4);
      const glow = new THREE.Mesh(glowGeometry, glowMaterial); glow.position.set(0, -0.05, 0); unitMesh.add(glow);

      if (isUnitPossessed(unit)) {
        try { attachPossessionOverlay(unitMesh); } catch {}
      }

      unitMesh.userData = { type: 'unit', row: r, col: c, unitData: unit, cardData };

      try {
        const invisible = hasInvisibility(state, r, c, { unit, tpl: cardData });
        if (invisible) {
          applyInvisibilityEffect(unitMesh);
        }
      } catch {}

      try { cardGroup.add(unitMesh); } catch {}
      ctx.unitMeshes.push(unitMesh);
    }
  }

  // Mirror for legacy code
  try { if (typeof window !== 'undefined') window.unitMeshes = ctx.unitMeshes; } catch {}

  try { renderFieldLocks(state); } catch {}
}

try { if (typeof window !== 'undefined') window.__units = { updateUnits }; } catch {}

