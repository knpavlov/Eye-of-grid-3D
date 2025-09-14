// Визуальный эффект для защищённых клеток (fieldquake/exchange lock)
// Показывает полупрозрачный силуэт замка, который мягко пульсирует
// Логика отделена от вычислений: сюда не передаются игровые состояния,
// только координаты уже вычисленных защищённых клеток

import { getCtx } from './context.js';

const state = {
  sprites: [],
  texture: null,
};

function getTexture(THREE) {
  if (state.texture) return state.texture;
  state.texture = new THREE.TextureLoader().load('textures/lock.svg');
  return state.texture;
}

export function showFieldLockTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  const gsap = (typeof window !== 'undefined') ? window.gsap : undefined;
  if (!tileMeshes || !THREE) return;
  clearFieldLockTiles();
  const tex = getTexture(THREE);
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.position.set(0, 1.01, 0); // немного над тайлом
    spr.scale.set(0.8, 0.8, 0.8);
    tile.add(spr);
    if (gsap) {
      gsap.to(mat, { opacity: 0.15, duration: 1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    state.sprites.push({ tile, spr, mat });
  }
}

export function clearFieldLockTiles() {
  const gsap = (typeof window !== 'undefined') ? window.gsap : undefined;
  for (const { tile, spr, mat } of state.sprites) {
    try { if (gsap) gsap.killTweensOf(mat); } catch {}
    try { tile.remove(spr); } catch {}
    try { mat.map?.dispose(); mat.dispose(); } catch {}
  }
  state.sprites = [];
}

export default { showFieldLockTiles, clearFieldLockTiles };

