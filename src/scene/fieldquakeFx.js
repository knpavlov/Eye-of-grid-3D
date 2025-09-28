// Визуальные эффекты смены стихий (fieldquake) без логики игры
import { getCtx } from './context.js';
import { getTileMaterial } from './board.js';

function normalizeElement(el) {
  if (typeof el !== 'string') return null;
  return el.toUpperCase();
}

function canBroadcastTileFx() {
  try {
    if (typeof window === 'undefined') return false;
    const netActive = typeof window.NET_ON === 'function'
      ? window.NET_ON()
      : !!window.NET_ACTIVE;
    if (!netActive) return false;
    if (!window.socket) return false;
    const seat = (typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
    const active = (typeof window.gameState?.active === 'number') ? window.gameState.active : null;
    if (seat != null && active != null && seat !== active) return false;
    return true;
  } catch {
    return false;
  }
}

export function playFieldquakeFx(event = {}, opts = {}) {
  try {
    const r = Number(event.r);
    const c = Number(event.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
    const prevElement = normalizeElement(event.prevElement);
    const nextElement = normalizeElement(event.nextElement);
    if (!prevElement || !nextElement || prevElement === nextElement) return false;

    const ctx = getCtx();
    const tileMeshes = ctx?.tileMeshes;
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) return false;

    const duration = typeof opts.duration === 'number' ? opts.duration : 0.9;

    const prevMat = getTileMaterial(prevElement);
    const nextMat = getTileMaterial(nextElement);
    if (window?.__fx?.dissolveTileCrossfade) {
      try {
        window.__fx.dissolveTileCrossfade(tile, prevMat, nextMat, duration);
      } catch {}
    }

    const shouldBroadcast = opts.broadcast === true;
    if (shouldBroadcast && canBroadcastTileFx()) {
      try {
        window.socket.emit('tileCrossfade', {
          r,
          c,
          prev: prevElement,
          next: nextElement,
        });
      } catch {}
    }

    return true;
  } catch {
    return false;
  }
}

export default {
  playFieldquakeFx,
};
