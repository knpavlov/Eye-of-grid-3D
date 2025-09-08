// Подсветка клеток на поле для выбора цели
// Теперь вся плитка пульсирует и покрывается "водным" шейдером
// с циклом проявления и затухания ~2.5 секунды.
import { getCtx } from './context.js';

// Внутреннее состояние активной подсветки
const state = {
  tiles: [],
  uniforms: [],
  rafId: 0,
};

// Создаём материал на основе исходного, добавляя водный пульсирующий эффект
function createPulseMaterial(THREE, srcMat) {
  const mat = srcMat.clone();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec2 vUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUv = uv;');
    const fragHead = '\n varying vec2 vUv;\n uniform float uTime;\n';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + fragHead)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n{
          float pulse = 0.5 + 0.5 * sin(uTime * 2.5);
          float wave = sin((vUv.x + vUv.y) * 20.0 + uTime * 4.0) * 0.5 + 0.5;
          vec3 water = vec3(0.2, 0.5, 1.0) * wave * 0.3;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb + water, 0.6);
          gl_FragColor.rgb *= mix(1.0, 1.6, pulse);
        }`
      );
    state.uniforms.push(shader.uniforms.uTime);
  };
  return mat;
}

// Запускает анимацию uniform uTime
function startAnim() {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function tick() {
    const t = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) / 1000;
    state.uniforms.forEach(u => { if (u) u.value = t; });
    state.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16);
  }
  tick();
}

// Подсветка переданных координат {r,c}
export function highlightTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  if (!tileMeshes || !THREE) return;

  clearHighlights();

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.userData._origMat = tile.material;
    tile.material = createPulseMaterial(THREE, tile.material);
    state.tiles.push(tile);
  }
  if (state.tiles.length) startAnim();
}

// Сброс подсветки
export function clearHighlights() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.tiles.forEach(tile => {
    if (tile.userData._origMat) {
      try { tile.material.dispose(); } catch {}
      tile.material = tile.userData._origMat;
      delete tile.userData._origMat;
    }
  });
  state.tiles = [];
}

// Экспорт в глобальную область для отладки
try {
  if (typeof window !== 'undefined') {
    window.__tileHighlight = { highlightTiles, clearHighlights };
  }
} catch {}

export default { highlightTiles, clearHighlights };
