// Анимация различий между предыдущим и новым состоянием
import { buildManaGainPlan } from './manaFx.js';

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

    const deathEvents = [];
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
              deathEvents.push({ r, c, owner: pu.owner, tplId: pu.tplId, element: pu.element || null });
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

    if (deathEvents.length) {
      const deathsByOwner = new Map();
      for (const d of deathEvents) {
        if (!Number.isFinite(d.owner)) continue;
        if (!deathsByOwner.has(d.owner)) deathsByOwner.set(d.owner, []);
        deathsByOwner.get(d.owner).push(d);
      }
      const abilityEntries = [];
      for (const [owner, ownerDeaths] of deathsByOwner.entries()) {
        const before = Math.max(0, Number(prevState?.players?.[owner]?.mana ?? 0));
        const after = Math.max(0, Number(nextState?.players?.[owner]?.mana ?? 0));
        const totalGain = Math.max(0, after - before);
        const baseCap = Math.max(0, 10 - before);
        const baseGain = Math.min(ownerDeaths.length, baseCap);
        let remaining = Math.max(0, Math.floor(totalGain - baseGain));
        if (remaining <= 0) continue;
        for (let i = 0; i < ownerDeaths.length && remaining > 0; i += 1) {
          const remainingDeaths = ownerDeaths.length - i;
          const amount = (i === ownerDeaths.length - 1)
            ? remaining
            : Math.max(1, Math.floor(remaining / remainingDeaths));
          abilityEntries.push({ owner, amount, death: ownerDeaths[i] });
          remaining -= amount;
        }
      }

      const manaPlan = buildManaGainPlan({
        playersBefore: prevState?.players,
        deaths: deathEvents,
        manaGainEntries: abilityEntries,
        tileMeshes,
        THREE: window.THREE || ctx.THREE,
      });
      try { manaPlan?.reserve?.(); } catch {}
      try { manaPlan?.schedule?.(); } catch {}
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

