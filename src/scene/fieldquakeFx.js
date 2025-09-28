// Визуальные эффекты для fieldquake, отделённые от игровой логики
import { getCtx } from './context.js';
import { getTileMaterial } from './board.js';

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function shouldBroadcast(activeSeat) {
  if (typeof window === 'undefined') return false;
  const online = typeof window.NET_ON === 'function' ? window.NET_ON() : !!window.NET_ACTIVE;
  if (!online || !window.socket) return false;
  const mySeat = typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null;
  const seatToCheck = typeof activeSeat === 'number'
    ? activeSeat
    : (typeof window.gameState?.active === 'number' ? window.gameState.active : null);
  if (mySeat == null || seatToCheck == null) return false;
  return mySeat === seatToCheck;
}

function normalizeHpShift(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const delta = Number(raw.delta ?? raw.deltaHp ?? 0);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }
  return {
    delta,
    before: Number.isFinite(raw.before) ? raw.before : null,
    after: Number.isFinite(raw.after) ? raw.after : null,
  };
}

export function playFieldquakeFx(event, opts = {}) {
  if (!event) return;
  const r = isInteger(event.r) ? event.r : Number(event.r);
  const c = isInteger(event.c) ? event.c : Number(event.c);
  if (!isInteger(r) || !isInteger(c)) return;

  const prevElement = event.prevElement || opts.prevElement || null;
  const nextElement = event.nextElement || opts.nextElement || prevElement || null;
  const ctx = getCtx();
  const tile = ctx?.tileMeshes?.[r]?.[c] || null;

  if (tile && typeof window !== 'undefined') {
    try {
      const prevMat = getTileMaterial(prevElement || tile.userData?.element || null);
      const nextMat = getTileMaterial(nextElement || prevElement || tile.userData?.element || null);
      window.__fx?.dissolveTileCrossfade?.(tile, prevMat, nextMat, 0.9);
    } catch {}
    try {
      tile.userData = tile.userData || {};
      tile.userData.element = nextElement;
    } catch {}
  }

  if (opts.sync !== false && shouldBroadcast(opts.activeSeat)) {
    try {
      window.socket.emit('tileCrossfade', {
        r,
        c,
        prev: prevElement,
        next: nextElement,
      });
    } catch {}
  }

  const hpShift = normalizeHpShift(opts.hpShift || event.hpShift || null);
  if (hpShift && ctx?.unitMeshes) {
    const mesh = ctx.unitMeshes.find(m => m?.userData?.row === r && m?.userData?.col === c);
    if (mesh) {
      const color = hpShift.delta > 0 ? '#22c55e' : '#ef4444';
      const text = `${hpShift.delta > 0 ? '+' : ''}${hpShift.delta}`;
      try { window.__fx?.spawnDamageText?.(mesh, text, color); } catch {}
    }
  }

  const unitDied = opts.unitDied ?? event.unitDied ?? false;
  if (unitDied && !opts.skipDeathFx && ctx?.unitMeshes) {
    const mesh = ctx.unitMeshes.find(m => m?.userData?.row === r && m?.userData?.col === c);
    if (mesh) {
      try {
        const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
        const offset = THREE ? new THREE.Vector3(0, 0, 0.6) : { x: 0, y: 0, z: 0.6 };
        window.__fx?.dissolveAndAsh?.(mesh, offset, 0.9);
      } catch {}
    }
  }
}

export function playFieldquakeFxBatch(list, opts = {}) {
  if (!Array.isArray(list) || !list.length) return;
  for (const ev of list) {
    playFieldquakeFx(ev, { ...opts, hpShift: opts.hpShift ?? ev?.hpShift });
  }
}

export default {
  playFieldquakeFx,
  playFieldquakeFxBatch,
};
