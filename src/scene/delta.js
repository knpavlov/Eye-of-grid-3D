// Анимация различий между предыдущим и новым состоянием

export function playDeltaAnimations(prevState, nextState, opts = {}) {
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

    const includeActive = !!opts.includeActive;
    const isActivePlayer = (typeof window.MY_SEAT === 'number' && gameState && typeof gameState.active === 'number' && window.MY_SEAT === gameState.active);

    if (!includeActive && isActivePlayer) {
      return;
    }

    const skipDeathFx = !!opts.skipDeathFx || (includeActive && isActivePlayer);

    const makeSignature = (unit) => {
      if (!unit) return null;
      if (unit.uid != null) return `UID:${unit.uid}`;
      const owner = unit.owner != null ? unit.owner : 'x';
      const tpl = unit.tplId || 'unknown';
      const hp = (typeof unit.currentHP === 'number') ? unit.currentHP : (typeof unit.hp === 'number' ? unit.hp : 'x');
      const facing = unit.facing || 'N';
      return `SIG:${owner}:${tpl}:${hp}:${facing}`;
    };

    const makeLooseSignature = (unit) => {
      if (!unit) return null;
      const owner = unit.owner != null ? unit.owner : 'x';
      const tpl = unit.tplId || 'unknown';
      return `LOOSE:${owner}:${tpl}`;
    };

    const prevB = prevState.board || [];
    const nextB = nextState.board || [];

    const nextPosByUid = new Map();
    const nextSigPositions = new Map();
    const nextLoosePositions = new Map();
    const prevLooseCounts = new Map();

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (!nu) continue;
        if (nu.uid != null) {
          nextPosByUid.set(nu.uid, { r, c });
        } else {
          const sig = makeSignature(nu);
          if (!sig) continue;
          if (!nextSigPositions.has(sig)) nextSigPositions.set(sig, []);
          nextSigPositions.get(sig).push({ r, c });
        }
        const loose = makeLooseSignature(nu);
        if (loose) {
          if (!nextLoosePositions.has(loose)) nextLoosePositions.set(loose, []);
          nextLoosePositions.get(loose).push({ r, c });
        }
      }
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu) {
          const loosePrev = makeLooseSignature(pu);
          if (loosePrev) {
            prevLooseCounts.set(loosePrev, (prevLooseCounts.get(loosePrev) || 0) + 1);
          }
        }
        if (pu && !nu) {
          const sigPrev = makeSignature(pu);
          let moved = false;
          if (pu.uid != null) {
            const pos = nextPosByUid.get(pu.uid);
            if (pos && (pos.r !== r || pos.c !== c)) moved = true;
          } else if (sigPrev) {
            const positions = nextSigPositions.get(sigPrev) || [];
            moved = positions.some(pos => pos.r !== r || pos.c !== c);
            if (!moved) {
              const looseKey = makeLooseSignature(pu);
              if (looseKey && (prevLooseCounts.get(looseKey) || 0) === 1) {
                const loosePositions = nextLoosePositions.get(looseKey) || [];
                moved = loosePositions.some(pos => pos.r !== r || pos.c !== c);
              }
            }
          }
          if (moved) continue;
          try {
            const prevPl = prevState?.players?.[pu.owner];
            const nextPl = nextState?.players?.[pu.owner];
            const canceled = prevPl && nextPl &&
              Array.isArray(prevPl.discard) && Array.isArray(nextPl.discard) &&
              Array.isArray(prevPl.hand) && Array.isArray(nextPl.hand) &&
              prevPl.discard.length > nextPl.discard.length &&
              nextPl.hand.length > prevPl.hand.length;
            if (!canceled) {
              if (skipDeathFx) continue;
              const tile = tileMeshes?.[r]?.[c]; if (!tile) continue;
              const ghost = createCard3D ? createCard3D(CARDS[pu.tplId], false) : null;
              if (ghost && window.THREE) {
                ghost.position.copy(tile.position).add(new window.THREE.Vector3(0, 0.28, 0));
                try { effectsGroup.add(ghost); } catch { cardGroup.add(ghost); }
                window.__fx?.dissolveAndAsh(ghost, new window.THREE.Vector3(0,0,0.6), 0.9);
              }
              const p = tile.position.clone().add(new window.THREE.Vector3(0, 1.2, 0));
              const slot = (prevState?.players?.[pu.owner]?.mana ?? 0);
              animateManaGainFromWorld?.(p, pu.owner, true, slot);
              try {
                if (!NET_ACTIVE && gameState && gameState.players && typeof pu.owner === 'number') {
                  gameState.players[pu.owner].mana = capMana((gameState.players[pu.owner].mana||0) + 1);
                  updateUI?.(gameState);
                }
              } catch {}
            }
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

    if (!includeActive && isActivePlayer) {
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

    const prevSteals = Array.isArray(prevState?.manaStealEvents) ? prevState.manaStealEvents : [];
    const nextSteals = Array.isArray(nextState?.manaStealEvents) ? nextState.manaStealEvents : [];
    const seenIds = new Set(prevSteals.map(ev => ev?.id));
    const fresh = nextSteals.filter(ev => ev && !seenIds.has(ev.id));
    const animateSteal = window.__ui?.mana?.animateManaSteal;
    if (typeof animateSteal === 'function' && fresh.length) {
      for (const ev of fresh) {
        try { animateSteal(ev); } catch (err) { console.warn('[delta] mana steal animation failed', err); }
      }
    }
  } catch {}
}

const api = { playDeltaAnimations };
try { if (typeof window !== 'undefined') window.playDeltaAnimations = playDeltaAnimations; } catch {}

export default api;

