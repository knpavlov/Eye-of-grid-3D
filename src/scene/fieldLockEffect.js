// Визуальный эффект для клеток, которые нельзя менять (fieldquake/exchange lock)
import { getCtx } from './context.js';

const state = { tiles: [], uniforms: [], rafId: 0 };

function createLockMaterial(origMat, THREE) {
  const mat = origMat.clone();
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
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
          float pulse = sin(uTime*3.0)*0.5 + 0.5;
          vec2 uv = vUv * 2.0 - 1.0;
          float wave = sin((uv.x+uTime*0.4)*8.0) * sin((uv.y+uTime*0.4)*8.0);
          vec3 col = vec3(1.0,0.4,0.1)*(0.6+0.4*wave)*pulse;
          gl_FragColor.rgb += col;
          gl_FragColor.a = max(gl_FragColor.a, 0.8*pulse);
        }`
      );
    state.uniforms.push(shader.uniforms.uTime);
  };
  return mat;
}

function startAnim() {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function tick() {
    const t = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) / 1000;
    state.uniforms.forEach(u => { if (u) u.value = t; });
    state.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(tick) : setTimeout(tick, 16);
  }
  tick();
}

export function applyFieldLocks(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  if (!tileMeshes || !THREE) return;
  clearFieldLocks();
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._origLockMat = obj.material;
        obj.material = createLockMaterial(obj.material, THREE);
      }
    });
    state.tiles.push(tile);
  }
  if (state.tiles.length) startAnim();
}

export function clearFieldLocks() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.tiles.forEach(tile => {
    tile.traverse(obj => {
      if (obj.isMesh && obj.userData._origLockMat) {
        try { obj.material.dispose(); } catch {}
        obj.material = obj.userData._origLockMat;
        delete obj.userData._origLockMat;
      }
    });
  });
  state.tiles = [];
}

const api = { applyFieldLocks, clearFieldLocks };
try { if (typeof window !== 'undefined') { window.__tileLocks = api; } } catch {}
export default api;
