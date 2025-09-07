// Анимация различий между предыдущим и новым состоянием

export function playDeltaAnimations(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;

    const gameState = window.gameState;
    const ctx = window.__scene?.getCtx?.() || {};
    const tileMeshes = ctx.tileMeshes || [];
    const unitMeshes = ctx.unitMeshes || [];
    const effectsGroup = ctx.effectsGroup;
    const cardGroup = ctx.cardGroup;
    const createCard3D = window.__cards?.createCard3D;
    const animateManaGainFromWorld = window.__ui?.mana?.animateManaGainFromWorld;
    const updateUI = window.updateUI;
    const NET_ACTIVE = typeof window.NET_ACTIVE !== 'undefined' ? window.NET_ACTIVE : false;
    const capMana = window.capMana || (x => x);
    const CARDS = window.CARDS || {};

    const isActivePlayer = (typeof window.MY_SEAT === 'number' && gameState && typeof gameState.active === 'number' && window.MY_SEAT === gameState.active);

    const prevB = prevState.board || [];
    const nextB = nextState.board || [];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && !nu) {
          try {
            const tile = tileMeshes?.[r]?.[c]; if (!tile) continue;
            const ghost = createCard3D ? createCard3D(CARDS[pu.tplId], false) : null;
            if (ghost && window.THREE) {
              ghost.position.copy(tile.position).add(new window.THREE.Vector3(0, 0.28, 0));
              try { effectsGroup.add(ghost); } catch { cardGroup.add(ghost); }
              window.__fx?.dissolveAndAsh(ghost, new window.THREE.Vector3(0,0,0.6), 0.9);
            }
            const p = tile.position.clone().add(new window.THREE.Vector3(0, 1.2, 0));
            const slot = (prevState?.players?.[pu.owner]?.mana ?? 0);
            // Сначала обновляем состояние маны локально, чтобы панель не моргала
            try {
              if (!NET_ACTIVE && gameState && gameState.players && typeof pu.owner === 'number') {
                gameState.players[pu.owner].mana = capMana((gameState.players[pu.owner].mana || 0) + 1);
              }
            } catch {}
            // Состояние уже обновлено, поэтому анимацию запускаем без "визуальной" блокировки
            animateManaGainFromWorld?.(p, pu.owner, false, slot);
          } catch {}
        } else if (!pu && nu) {
          try {
            const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (tMesh && window.gsap) {
              const s = tMesh.scale.clone();
              tMesh.scale.set(s.x * 0.7, s.y * 0.7, s.z * 0.7);
              window.gsap.to(tMesh.scale, { x: s.x, y: s.y, z: s.z, duration: 0.28, ease: 'power2.out' });
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
    const pendingHpChanges = (window.RECENT_REMOTE_DAMAGE && window.RECENT_REMOTE_DAMAGE.size)
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

const api = { playDeltaAnimations };
try { if (typeof window !== 'undefined') window.playDeltaAnimations = playDeltaAnimations; } catch {}

export default api;

