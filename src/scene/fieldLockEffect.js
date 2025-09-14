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

    // изначально почти прозрачный замок
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xf97316, transparent: true, opacity: 0.2 });
    const spr = new THREE.Sprite(mat);

    // смещаем иконку в правый верхний угол и немного вниз, чтобы не наезжала на ячейку выше
    const tileSize = tile.geometry?.parameters?.width || 1;
    const iconSize = 0.8;
    const offset = tileSize / 2 - iconSize / 2;
    const extra = iconSize * 0.15;
    const downShift = iconSize * 0.25; // сдвиг к нижней части плитки
    spr.position
      .copy(tile.position)
      .add(new THREE.Vector3(offset + extra, 0.8, -(offset + extra) + downShift));
    spr.scale.set(iconSize, iconSize, iconSize);
    spr.renderOrder = 1300; // поверх карт на поле
    effectsGroup.add(spr);

    // пульсация почти до полной непрозрачности
    try { window.gsap?.to(mat, { opacity: 0.95, duration: 0.8, yoyo: true, repeat: -1 }); } catch {}
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
