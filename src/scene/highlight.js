// Подсветка клеток на поле для выбора цели.
// Верхняя поверхность клетки покрывается пульсирующим "водным" свечением,
// которое проявляется и затухает каждые пару секунд.
import { getCtx } from './context.js';

// Внутреннее состояние активной подсветки
const state = {
  tiles: [],
  uniforms: [],
  rafId: 0,
};

// Обновляет шейдер материала, добавляя водную пульсацию
function injectPulseShader(mat) {
  if (!mat || typeof mat.onBeforeCompile !== 'function') return mat;
  const clone = typeof mat.clone === 'function' ? mat.clone() : mat;
  if (!clone || typeof clone.onBeforeCompile !== 'function') return clone;
  clone.transparent = true;
  clone.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUv = uv;');
    const head = `\n varying vec2 vUv;\n uniform float uTime;\n`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + head)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n{
          float pulse = sin(uTime*2.5)*0.5 + 0.5; // цикл ~2.5 секунды
          vec2 uv = vUv * 2.0 - 1.0;
          float wave = sin((uv.x + uTime*0.2)*10.0) * sin((uv.y + uTime*0.3)*10.0);
          vec3 water = vec3(0.3,0.6,1.0) * (0.6 + 0.4*wave) * pulse;
          gl_FragColor.rgb += water;
          gl_FragColor.a = max(gl_FragColor.a, pulse*0.8);
        }`
      );
    state.uniforms.push(shader.uniforms.uTime);
  };
  return clone;
}

// Создаёт набор материалов с подсветкой для всей плитки
function createPulseMaterial(origMat) {
  if (!origMat) return origMat;
  if (Array.isArray(origMat)) {
    // Индекс 2 соответствует верхней поверхности тайла из board.js
    return origMat.map((mat, idx) => {
      if (!mat) return mat;
      if (idx === 2) return injectPulseShader(mat);
      return typeof mat.clone === 'function' ? mat.clone() : mat;
    });
  }
  return injectPulseShader(origMat);
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(m => { if (m && typeof m.dispose === 'function') { try { m.dispose(); } catch {} } });
    return;
  }
  if (material && typeof material.dispose === 'function') {
    try { material.dispose(); } catch {}
  }
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
  const { tileMeshes } = ctx;
  if (!tileMeshes) return;

  clearHighlights();

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._origMat = obj.material;
        obj.material = createPulseMaterial(obj.material);
      }
    });
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
    tile.traverse(obj => {
      if (obj.isMesh && obj.userData._origMat) {
        disposeMaterial(obj.material);
        obj.material = obj.userData._origMat;
        delete obj.userData._origMat;
      }
    });
  });
  state.tiles = [];
}

// Экспорт в глобальную область для отладки
try { if (typeof window !== 'undefined') { window.__tileHighlight = { highlightTiles, clearHighlights }; } } catch {}

export default { highlightTiles, clearHighlights };
