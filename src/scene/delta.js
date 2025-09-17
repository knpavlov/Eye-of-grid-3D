// Анимация различий между предыдущим и новым состоянием

function makeUnitKey(unit) {
  if (!unit) return null;
  if (unit.uid != null) return `UID:${unit.uid}`;
  const owner = unit.owner != null ? unit.owner : '?';
  const tpl = unit.tplId || 'UNKNOWN';
  const facing = unit.facing || 'N';
  const bonus = unit.bonusHP || 0;
  const tempAtk = unit.tempAtkBuff || 0;
  const possessed = unit.possessed ? `P${unit.possessed.by}` : '';
  return `SIG:${owner}|${tpl}|${facing}|${bonus}|${tempAtk}|${possessed}`;
}

export function animateUnitMovements(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    const ctx = window.__scene?.getCtx?.() || {};
    const tileMeshes = ctx.tileMeshes || [];
    const unitMeshes = ctx.unitMeshes || [];
    const gsap = window.gsap;
    if (!Array.isArray(tileMeshes) || !tileMeshes.length || !Array.isArray(unitMeshes) || !unitMeshes.length) return;

    const prevBoard = prevState.board || [];
    const nextBoard = nextState.board || [];

    const prevByUid = new Map();
    const nextByUid = new Map();
    const prevFallback = [];
    const nextFallback = [];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = prevBoard?.[r]?.[c]?.unit || null;
        if (pu) {
          const key = pu.uid != null ? `UID:${pu.uid}` : null;
          if (key) prevByUid.set(key, { r, c, unit: pu });
          else prevFallback.push({ r, c, unit: pu });
        }
        const nu = nextBoard?.[r]?.[c]?.unit || null;
        if (nu) {
          const key = nu.uid != null ? `UID:${nu.uid}` : null;
          if (key) nextByUid.set(key, { r, c, unit: nu });
          else nextFallback.push({ r, c, unit: nu });
        }
      }
    }

    const moves = [];
    for (const [key, prevInfo] of prevByUid.entries()) {
      const nextInfo = nextByUid.get(key);
      if (!nextInfo) continue;
      if (prevInfo.r !== nextInfo.r || prevInfo.c !== nextInfo.c) {
        moves.push({ prev: prevInfo, next: nextInfo });
      }
      nextByUid.delete(key);
    }

    const usedNextFallback = new Set();
    for (const prevInfo of prevFallback) {
      const prevKey = makeUnitKey(prevInfo.unit);
      let matchIndex = -1;
      for (let i = 0; i < nextFallback.length; i++) {
        if (usedNextFallback.has(i)) continue;
        const nextInfo = nextFallback[i];
        if (prevKey && prevKey === makeUnitKey(nextInfo.unit)) { matchIndex = i; break; }
        if (!prevKey && nextInfo.unit.tplId === prevInfo.unit.tplId && nextInfo.unit.owner === prevInfo.unit.owner) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex >= 0) {
        usedNextFallback.add(matchIndex);
        const nextInfo = nextFallback[matchIndex];
        if (prevInfo.r !== nextInfo.r || prevInfo.c !== nextInfo.c) {
          moves.push({ prev: prevInfo, next: nextInfo });
        }
      }
    }

    if (!moves.length) return;

    for (const move of moves) {
      const mesh = unitMeshes.find(m => m?.userData?.unitData === move.next.unit);
      if (!mesh) continue;
      const fromTile = tileMeshes?.[move.prev.r]?.[move.prev.c];
      const finalTile = tileMeshes?.[move.next.r]?.[move.next.c];
      if (!fromTile || !finalTile) continue;
      const finalPos = mesh.position.clone();
      const startPos = fromTile.position.clone();
      startPos.y = finalPos.y;
      if (!gsap) {
        mesh.position.set(finalPos.x, finalPos.y, finalPos.z);
        continue;
      }
      mesh.position.set(startPos.x, finalPos.y, startPos.z);
      const tl = gsap.timeline();
      tl.to(mesh.position, { x: finalPos.x, z: finalPos.z, duration: 0.38, ease: 'power2.inOut' }, 0);
      tl.fromTo(mesh.position, { y: finalPos.y + 0.45 }, { y: finalPos.y, duration: 0.38, ease: 'sine.out' }, 0);
    }
  } catch {}
}

export function playDeltaAnimations(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;

    animateUnitMovements(prevState, nextState);

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
            const prevPl = prevState?.players?.[pu.owner];
            const nextPl = nextState?.players?.[pu.owner];
            const canceled = prevPl && nextPl &&
              Array.isArray(prevPl.discard) && Array.isArray(nextPl.discard) &&
              Array.isArray(prevPl.hand) && Array.isArray(nextPl.hand) &&
              prevPl.discard.length > nextPl.discard.length &&
              nextPl.hand.length > prevPl.hand.length;
            if (!canceled) {
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

const api = { playDeltaAnimations, animateUnitMovements };
try {
  if (typeof window !== 'undefined') {
    window.playDeltaAnimations = playDeltaAnimations;
    window.animateUnitMovements = animateUnitMovements;
  }
} catch {}

export default api;

