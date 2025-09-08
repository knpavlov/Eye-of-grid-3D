// Магическая подсветка доступных клеток с эффектом лучей света
// Использует GodRaysEffect из библиотеки postprocessing и динамически
// добавляет источники света между клетками
import { getCtx } from './context.js';

// Состояние подсветки
const state = {
  lights: [],      // меши-эмиттеры света
  passes: [],      // Pass'ы постпроцессинга
  rafId: 0,
  composerReady: false,
  composerPromise: null,
  EffectPass: null,
  GodRaysEffect: null,
};

// Загружает модуль postprocessing и создаёт EffectComposer при необходимости
async function ensureComposer() {
  if (state.composerReady || state.composerPromise) return state.composerPromise;
  const ctx = getCtx();
  const { renderer, scene, camera } = ctx;
  if (!renderer || !scene || !camera) return;
  state.composerPromise = (async () => {
    try {
      // Загружаем ESM-версию postprocessing с jsDelivr
      const mod = await import('https://cdn.jsdelivr.net/npm/postprocessing@6.33.3/+esm');
      const pp = mod?.default ?? mod; // подстраховка на случай различий экспорта
      const { EffectComposer, RenderPass, EffectPass, GodRaysEffect } = pp;
      if (!EffectComposer || !RenderPass || !EffectPass || !GodRaysEffect) {
        throw new Error('postprocessing не содержит нужных классов');
      }
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      ctx.composer = composer;
      state.EffectPass = EffectPass;
      state.GodRaysEffect = GodRaysEffect;
      state.composerReady = true;
    } catch (e) {
      console.error('Не удалось загрузить postprocessing:', e);
    }
  })();
  return state.composerPromise;
}

// Вспомогательная функция для мерцания источников
function startBlink() {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function tick() {
    const t = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) / 1000;
    state.lights.forEach(l => { if (l.material) l.material.opacity = 0.7 + Math.sin(t * 3) * 0.3; });
    state.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(tick) : setTimeout(tick, 16);
  }
  tick();
}

// Подсветка указанных клеток {r,c}
export async function highlightTiles(cells = []) {
  const ctx = getCtx();
  const { THREE, tileMeshes, effectsGroup, camera } = ctx;
  if (!THREE || !tileMeshes || !effectsGroup || !camera) return;

  await ensureComposer();
  clearHighlights();
  if (!state.composerReady) return;

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const pos = tile.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    const emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true })
    );
    emitter.position.copy(pos);
    effectsGroup.add(emitter);

    const effect = new state.GodRaysEffect(camera, emitter, {
      density: 0.95,
      decay: 0.93,
      weight: 0.4,
      samples: 60,
      clampMax: 1.0,
      color: new THREE.Color(0x7dd3fc),
    });
    const pass = new state.EffectPass(camera, effect);
    // предыдущий pass больше не финальный
    if (state.passes.length) state.passes[state.passes.length - 1].renderToScreen = false;
    pass.renderToScreen = true;
    ctx.composer.addPass(pass);

    state.lights.push(emitter);
    state.passes.push(pass);
  }

  if (state.lights.length) startBlink();
}

// Очистка подсветки
export function clearHighlights() {
  const ctx = getCtx();
  const { effectsGroup } = ctx;
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.lights.forEach(l => {
    try { effectsGroup.remove(l); l.geometry.dispose(); l.material.dispose(); } catch {}
  });
  state.passes.forEach(p => {
    try { ctx.composer.removePass(p); } catch {}
  });
  state.lights = [];
  state.passes = [];
}

// Экспортируем функции по умолчанию
try { if (typeof window !== 'undefined') { window.__tileHighlight = { highlightTiles, clearHighlights }; } } catch {}

export default { highlightTiles, clearHighlights };
