// Отдельный визуальный эффект для клеток, которые нельзя fieldquake/exchange
import { getCtx } from './context.js';
import { computeLockedCells } from '../core/fieldLocks.js';

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
          float pulse = sin(uTime*3.0)*0.5+0.5;
          vec2 uv = vUv*2.0-1.0;
          float ring = smoothstep(0.6,0.7,length(uv));
          vec3 col = vec3(1.0,0.4,0.0) * ring * pulse;
          gl_FragColor.rgb += col;
          gl_FragColor.a = max(gl_FragColor.a, ring*pulse*0.8);
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
    state.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(tick) : setTimeout(tick,16);
  }
  tick();
}

export function applyFieldLockFx(gameState) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  if (!tileMeshes || !THREE) return;

  clearFieldLockFx();
  const cells = computeLockedCells(gameState);
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._origMatLock = obj.material;
        obj.material = createLockMaterial(obj.material, THREE);
      }
    });
    state.tiles.push(tile);
  }
  if (state.tiles.length) startAnim();
}

export function clearFieldLockFx() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.tiles.forEach(tile => {
    tile.traverse(obj => {
      if (obj.isMesh && obj.userData._origMatLock) {
        try { obj.material.dispose(); } catch {}
        obj.material = obj.userData._origMatLock;
        delete obj.userData._origMatLock;
      }
    });
  });
  state.tiles = [];
}

try { if (typeof window !== 'undefined') { window.__fieldLockFx = { applyFieldLockFx, clearFieldLockFx }; } } catch {}

export default { applyFieldLockFx, clearFieldLockFx };
