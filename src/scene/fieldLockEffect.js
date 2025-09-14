// Визуальный эффект для клеток, защищённых от fieldquake/exchange
// Использует спрайт замка поверх плитки
import { getCtx } from './context.js';

const state = {
  sprites: [],
  tex: null,
};

function getTexture(THREE) {
  if (!state.tex) {
    const loader = new THREE.TextureLoader();
    try { state.tex = loader.load('./textures/lock.svg'); } catch {}
  }
  return state.tex;
}

export function showFieldLockTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, effectsGroup, THREE } = ctx;
  if (!tileMeshes || !effectsGroup || !THREE) return;
  clearFieldLockTiles();
  const tex = getTexture(THREE);
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xf97316, transparent: true, opacity: 0.25 });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(tile.position).add(new THREE.Vector3(0, 0.52, 0));
    spr.scale.set(0.8, 0.8, 0.8);
    effectsGroup.add(spr);
    try { window.gsap?.to(mat, { opacity: 0.05, duration: 0.8, yoyo: true, repeat: -1 }); } catch {}
    state.sprites.push(spr);
  }
}

export function clearFieldLockTiles() {
  const ctx = getCtx();
  const { effectsGroup } = ctx;
  state.sprites.forEach(s => {
    try { window.gsap?.killTweensOf(s.material); effectsGroup.remove(s); s.material.dispose(); } catch {}
  });
  state.sprites = [];
}

export default { showFieldLockTiles, clearFieldLockTiles };
