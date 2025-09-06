// Delta animations: visualizes changes between game states (unit spawns, deaths, HP deltas)
// Extracted from legacy inline script in index.html to allow reuse across modules.
import { getCtx } from './context.js';
import { createCard3D } from './cards.js';

// Tracks recently shown remote damage to avoid duplicate popups
export const RECENT_REMOTE_DAMAGE = new Map();
try {
  if (typeof window !== 'undefined') window.RECENT_REMOTE_DAMAGE = RECENT_REMOTE_DAMAGE;
} catch {}

// Show visual differences between previous and next state
export function playDeltaAnimations(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    const ctx = getCtx();
    const {
      tileMeshes = [],
      unitMeshes = [],
      effectsGroup,
      cardGroup,
      THREE = (typeof window !== 'undefined' ? window.THREE : undefined),
    } = ctx;
    const gsap = (typeof window !== 'undefined' ? window.gsap : undefined);
    const animateManaGainFromWorld = (typeof window !== 'undefined' ? window.animateManaGainFromWorld : undefined);
    const updateUI = (typeof window !== 'undefined' ? window.updateUI : undefined);
    const capMana = (typeof window !== 'undefined' ? window.capMana : undefined);
    const NET_ACTIVE = (typeof window !== 'undefined' ? window.NET_ACTIVE : undefined);
    const gameState = (typeof window !== 'undefined' ? window.gameState : undefined);
    const isActivePlayer = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number' && gameState && typeof gameState.active === 'number' && window.MY_SEAT === gameState.active);

    const prevB = prevState.board || [];
    const nextB = nextState.board || [];

    // Handle unit removal/appearance
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && !nu) {
          try {
            const tile = tileMeshes?.[r]?.[c];
            if (!tile) continue;
            const ghost = createCard3D(window.CARDS[pu.tplId], false);
            ghost.position.copy(tile.position).add(new THREE.Vector3(0, 0.28, 0));
            try { effectsGroup.add(ghost); } catch { cardGroup.add(ghost); }
            window.__fx?.dissolveAndAsh(ghost, new THREE.Vector3(0, 0, 0.6), 0.9);
            const p = tile.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            animateManaGainFromWorld?.(p, pu.owner, true);
            try {
              if (!NET_ACTIVE && gameState?.players && typeof pu.owner === 'number') {
                gameState.players[pu.owner].mana = capMana((gameState.players[pu.owner].mana || 0) + 1);
                updateUI?.(gameState);
              }
            } catch {}
          } catch {}
        } else if (!pu && nu) {
          try {
            const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (tMesh) {
              const s = tMesh.scale.clone();
              tMesh.scale.set(s.x * 0.7, s.y * 0.7, s.z * 0.7);
              gsap?.to(tMesh.scale, { x: s.x, y: s.y, z: s.z, duration: 0.28, ease: 'power2.out' });
            }
          } catch {}
        }
      }
    }

    // Active player already sees HP changes via local animations
    if (isActivePlayer) return;

    const hpChanges = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && nu) {
          const pHP = (typeof pu.currentHP === 'number') ? pu.currentHP : pu.hp;
          const nHP = (typeof nu.currentHP === 'number') ? nu.currentHP : nu.hp;
          const delta = (typeof pHP === 'number' && typeof nHP === 'number') ? (nHP - pHP) : 0;
          if (delta !== 0) hpChanges.push({ r, c, delta });
        }
      }
    }

    const now = Date.now();
    const pendingHpChanges = (typeof window !== 'undefined' && window.RECENT_REMOTE_DAMAGE && window.RECENT_REMOTE_DAMAGE.size)
      ? hpChanges.filter(change => {
          try {
            const key = `${change.r},${change.c}`;
            const rec = window.RECENT_REMOTE_DAMAGE.get(key);
            return !(rec && rec.delta === change.delta && (now - rec.ts) < 2000);
          } catch { return true; }
        })
      : hpChanges;

    const halfCount = Math.ceil(pendingHpChanges.length / 2);
    for (let i = 0; i < halfCount && i < pendingHpChanges.length; i++) {
      const change = pendingHpChanges[i];
      window.__fx?.scheduleHpPopup(change.r, change.c, change.delta, 800);
    }
    if (pendingHpChanges.length > halfCount) {
      for (let i = halfCount; i < pendingHpChanges.length; i++) {
        const change = pendingHpChanges[i];
        window.__fx?.scheduleHpPopup(change.r, change.c, change.delta, 1600);
      }
    }
  } catch {}
}

export default { playDeltaAnimations, RECENT_REMOTE_DAMAGE };
