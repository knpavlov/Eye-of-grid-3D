// Магическая подсветка клеток с лучами света между ними
// Использует GodRaysEffect из three.js постобработки
// и динамически подключает необходимые модули
import { getCtx } from './context.js';

// Состояние активных источников и пассов
const state = {
  sources: [], // сферы-источники света
  pass: null,  // общий эффектный pass
};

// Однажды загруженный модуль постобработки
let ppPromise = null;

// Подготовка композитора и эффектов
async function ensurePostprocessing() {
  const ctx = getCtx();
  if (!ctx.renderer || !ctx.scene || !ctx.camera) return;
  if (!ppPromise) {
    // Загружаем библиотеку postprocessing с CDN
    ppPromise = import('https://cdn.jsdelivr.net/npm/postprocessing@6.34.1/build/postprocessing.esm.js');
  }
  const pp = await ppPromise;
  if (!ctx.composer) {
    ctx.composer = new pp.EffectComposer(ctx.renderer);
    ctx.composer.addPass(new pp.RenderPass(ctx.scene, ctx.camera));
  }
  ctx._pp = pp; // сохраняем для повторного использования
}

// Подсветка переданных координат {r,c}
export async function highlightTiles(cells = []) {
  try {
    const ctx = getCtx();
    await ensurePostprocessing();
    clearHighlights();
    const { THREE, tileMeshes, effectsGroup, camera, composer, _pp } = ctx;
    if (!THREE || !tileMeshes || !effectsGroup || !_pp) return;

    const sources = [];
    const effects = [];
    for (const { r, c } of cells) {
      const tile = tileMeshes?.[r]?.[c];
      if (!tile) continue;
      // Создаём маленькую сферу-источник голубого света
      const geom = new THREE.SphereGeometry(0.35, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.copy(tile.position).add(new THREE.Vector3(0, 0.4, 0));
      effectsGroup.add(sphere);
      sources.push(sphere);
      // Эффект лучей, исходящих из сферы
      const effect = new _pp.GodRaysEffect(camera, sphere, {
        density: 0.96,
        decay: 0.93,
        weight: 0.6,
        exposure: 0.6,
        samples: 60,
        color: 0x7dd3fc,
      });
      effects.push(effect);
    }
    if (effects.length) {
      const pass = new _pp.EffectPass(camera, ...effects);
      pass.renderToScreen = true;
      composer.addPass(pass);
      state.pass = pass;
      state.sources = sources;
    }
  } catch (e) {
    console.error('highlightTiles error', e);
  }
}

// Сброс подсветки и очистка ресурсов
export function clearHighlights() {
  const ctx = getCtx();
  const { effectsGroup, composer } = ctx;
  state.sources.forEach(s => {
    try {
      effectsGroup.remove(s);
      s.geometry.dispose();
      s.material.dispose();
    } catch {}
  });
  state.sources = [];
  if (state.pass && composer) {
    try { composer.removePass(state.pass); } catch {}
    state.pass = null;
  }
}

// Экспорт для отладки в браузере
try {
  if (typeof window !== 'undefined') {
    window.__tileHighlight = { highlightTiles, clearHighlights };
  }
} catch {}

export default { highlightTiles, clearHighlights };
