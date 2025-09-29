// Подсветка клеток для размещения существ.
// Эффект подчёркивает границы клетки мягким свечением,
// чтобы было видно элемент поля и при этом заметить доступность.
import { getCtx } from './context.js';

const state = {
  tiles: [],
  uniforms: [],
  rafId: 0,
};

function injectSummonShader(mat) {
  if (!mat || typeof mat.onBeforeCompile !== 'function') return mat;
  const clone = typeof mat.clone === 'function' ? mat.clone() : mat;
  if (!clone || typeof clone.onBeforeCompile !== 'function') return clone;
  clone.transparent = true;
  clone.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUv = uv;');
    const head = '\n varying vec2 vUv;\n uniform float uTime;\n';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + head)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n{
          vec2 centered = vUv - 0.5;
          float squareRadius = max(abs(centered.x), abs(centered.y));
          float border = smoothstep(0.15, 0.48, squareRadius * 2.0);
          float pulse = sin(uTime * 1.6) * 0.05 + 0.08;
          float halo = clamp(border + pulse, 0.0, 1.0);
          vec3 edgeColor = vec3(0.45, 0.8, 0.75);
          vec3 tint = mix(gl_FragColor.rgb, edgeColor, halo * 0.6);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, tint, 0.6);
          float fade = smoothstep(0.18, 0.52, squareRadius);
          gl_FragColor.a = max(gl_FragColor.a, fade * 0.35 + pulse * 0.1);
        }`
      );
    state.uniforms.push(shader.uniforms.uTime);
  };
  return clone;
}

function createSummonMaterial(origMat) {
  if (!origMat) return origMat;
  if (Array.isArray(origMat)) {
    return origMat.map((mat, idx) => {
      if (!mat) return mat;
      if (idx === 2) return injectSummonShader(mat);
      return typeof mat.clone === 'function' ? mat.clone() : mat;
    });
  }
  return injectSummonShader(origMat);
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

export function highlightSummonTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes } = ctx;
  if (!tileMeshes) return;

  clearSummonHighlights();

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._summonOrigMat = obj.material;
        obj.material = createSummonMaterial(obj.material);
      }
    });
    state.tiles.push(tile);
  }
  if (state.tiles.length) startAnim();
}

export function clearSummonHighlights() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.tiles.forEach(tile => {
    tile.traverse(obj => {
      if (obj.isMesh && obj.userData._summonOrigMat) {
        disposeMaterial(obj.material);
        obj.material = obj.userData._summonOrigMat;
        delete obj.userData._summonOrigMat;
      }
    });
  });
  state.tiles = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__summonHighlight = { highlightSummonTiles, clearSummonHighlights };
  }
} catch {}

export default { highlightSummonTiles, clearSummonHighlights };
