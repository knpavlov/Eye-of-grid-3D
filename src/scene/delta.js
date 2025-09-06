import { getCtx } from './context.js';
import { createCard3D } from './cards.js';
import { animateManaGainFromWorld } from '../ui/mana.js';
import { CARDS } from '../core/cards.js';
import { capMana } from '../core/constants.js';

export function playDeltaAnimations(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    const ctx = getCtx();
    const { tileMeshes, unitMeshes, effectsGroup, cardGroup, THREE } = ctx;

    const isActivePlayer = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number' && window.gameState && typeof window.gameState.active === 'number' && window.MY_SEAT === window.gameState.active);

    const prevB = prevState.board || [];
    const nextB = nextState.board || [];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && !nu) {
          try {
            const tile = tileMeshes?.[r]?.[c]; if (!tile) continue;
            const ghost = createCard3D(CARDS[pu.tplId], false);
            ghost.position.copy(tile.position).add(new THREE.Vector3(0, 0.28, 0));
            try { effectsGroup.add(ghost); } catch { cardGroup.add(ghost); }
            window.__fx?.dissolveAndAsh(ghost, new THREE.Vector3(0,0,0.6), 0.9);
            const p = tile.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            animateManaGainFromWorld(p, pu.owner, true);
            try {
              if (!window.NET_ACTIVE && window.gameState && window.gameState.players && typeof pu.owner === 'number') {
                window.gameState.players[pu.owner].mana = capMana((window.gameState.players[pu.owner].mana||0) + 1);
                window.updateUI?.();
              }
            } catch {}
          } catch {}
        } else if (!pu && nu) {
          try {
            const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (tMesh) {
              const s = tMesh.scale.clone();
              tMesh.scale.set(s.x * 0.7, s.y * 0.7, s.z * 0.7);
              (typeof window !== 'undefined' ? window.gsap : null)?.to(tMesh.scale, { x: s.x, y: s.y, z: s.z, duration: 0.28, ease: 'power2.out' });
            }
          } catch {}
        }
      }
    }

    if (isActivePlayer) {
      return;
    }

    const hpChanges = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && nu) {
          const pHP = (typeof pu.currentHP === 'number') ? pu.currentHP : pu.hp;
          const nHP = (typeof nu.currentHP === 'number') ? nu.currentHP : nu.hp;
          const delta = (typeof pHP === 'number' && typeof nHP === 'number') ? (nHP - pHP) : 0;
          if (delta !== 0) {
            hpChanges.push({ r, c, delta });
          }
        }
      }
    }

    const __now = Date.now();
    const pendingHpChanges = (typeof window !== 'undefined' && window.RECENT_REMOTE_DAMAGE && window.RECENT_REMOTE_DAMAGE.size)
      ? hpChanges.filter(change => {
          try {
            const key = `${change.r},${change.c}`;
            const rec = window.RECENT_REMOTE_DAMAGE.get(key);
            return !(rec && rec.delta === change.delta && (__now - rec.ts) < 2000);
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

export default { playDeltaAnimations };
