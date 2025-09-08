// Подсветка доступных клеток с использованием GodRaysEffect
// Лучи голубого света красиво просачиваются через промежутки между тайлами
import { getCtx } from './context.js';

// Внутреннее состояние текущей подсветки
const state = {
  lightGroup: null,
  composer: null,
  resizeHandler: null,
};

// Ленивый импорт библиотеки postprocessing
let PP = null;
async function loadPP() {
  if (!PP) {
    PP = await import('https://cdn.jsdelivr.net/npm/postprocessing@6.35.1/build/postprocessing.esm.js');
  }
  return PP;
}

// Включает подсветку указанных клеток
export function highlightTiles(cells = []) {
  (async () => {
    const ctx = getCtx();
    const { THREE, scene, camera, renderer, tileMeshes } = ctx;
    if (!THREE || !scene || !camera || !renderer) return;
    clearHighlights();
    if (!cells.length) return;

    const { EffectComposer, RenderPass, EffectPass, GodRaysEffect, BlendFunction } = await loadPP();

    // Создаём группу источников света для эффекта
    const g = new THREE.Group();
    for (const { r, c } of cells) {
      const tile = tileMeshes?.[r]?.[c];
      if (!tile) continue;
      const pos = tile.position.clone().add(new THREE.Vector3(0, 0.3, 0));
      const src = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
      );
      src.position.copy(pos);
      g.add(src);
    }
    if (!g.children.length) return;
    scene.add(g);
    state.lightGroup = g;

    // Настраиваем GodRaysEffect
    const composer = new EffectComposer(renderer);
    composer.setSize(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    const godrays = new GodRaysEffect(camera, g, {
      blendFunction: BlendFunction.ADD,
      density: 0.92,
      decay: 0.93,
      weight: 0.6,
      exposure: 0.6,
      samples: 60,
      color: new THREE.Color(0x7dd3fc),
    });
    const pass = new EffectPass(camera, godrays);
    pass.renderToScreen = true;
    composer.addPass(pass);
    state.composer = composer;
    ctx.composer = composer;

    // Обновление размеров при ресайзе окна
    state.resizeHandler = () => {
      try { composer.setSize(window.innerWidth, window.innerHeight); } catch {}
    };
    if (typeof window !== 'undefined') window.addEventListener('resize', state.resizeHandler);
  })();
}

// Отключает подсветку и очищает ресурсы
export function clearHighlights() {
  const ctx = getCtx();
  const { scene } = ctx;
  if (state.resizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', state.resizeHandler);
    state.resizeHandler = null;
  }
  if (state.lightGroup) {
    try {
      scene.remove(state.lightGroup);
      state.lightGroup.traverse(obj => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        }
      });
    } catch {}
    state.lightGroup = null;
  }
  if (state.composer) {
    try { state.composer.dispose(); } catch {}
    state.composer = null;
  }
  ctx.composer = null;
}

// Экспорт в глобальную область для отладки
try { if (typeof window !== 'undefined') { window.__tileHighlight = { highlightTiles, clearHighlights }; } } catch {}

export default { highlightTiles, clearHighlights };
