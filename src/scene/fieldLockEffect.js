// Визуальный эффект блокировки поля в виде иконки замка
// Отдельный модуль, не затрагивающий логику игры
import { getCtx } from './context.js';

const state = {
  meshes: [],
  rafId: 0,
  tex: null,
};

// загрузка текстуры замка один раз
function ensureTexture(THREE) {
  if (!state.tex) {
    const loader = new THREE.TextureLoader();
    state.tex = loader.load('textures/lock.svg');
  }
  return state.tex;
}

function startAnim() {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const tick = () => {
    const t = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) / 1000;
    for (const m of state.meshes) {
      m.material.opacity = 0.2 + 0.2 * Math.sin(t * 3);
    }
    state.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16);
  };
  tick();
}

export function showFieldLockTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  if (!tileMeshes || !THREE) return;
  clearFieldLockTiles();
  const tex = ensureTexture(THREE);
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.01, 0); // чуть над плиткой
    tile.add(mesh);
    state.meshes.push(mesh);
  }
  if (state.meshes.length) startAnim();
}

export function clearFieldLockTiles() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.meshes.forEach(m => {
    m.parent?.remove(m);
    try { m.geometry.dispose(); } catch {}
    try { m.material.dispose(); } catch {}
  });
  state.meshes = [];
}

export default { showFieldLockTiles, clearFieldLockTiles };
