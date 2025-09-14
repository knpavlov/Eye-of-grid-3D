// Визуальный эффект для клеток, защищённых от fieldquake/exchange
// Основан на эффекте подсветки, но имеет иной цвет и форму
import { getCtx } from './context.js';

const state = {
  tiles: [],
  uniforms: [],
  rafId: 0,
};

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
          // простая фигура замка: дуга + прямоугольное тело
          float body = step(abs(uv.x),0.3)*step(-0.2,uv.y)*step(uv.y,0.4);
          float outer = step(length(uv+vec2(0.0,0.3)),0.5);
          float inner = step(length(uv+vec2(0.0,0.3)),0.3);
          float shackle = (outer-inner)*step(uv.y,0.0);
          float lock = max(body, shackle);
          vec3 glow = vec3(1.0,0.6,0.1)*lock*(0.3+0.2*pulse);
          gl_FragColor.rgb += glow;
          gl_FragColor.a = max(gl_FragColor.a, lock*pulse*0.4);
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
    state.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16);
  }
  tick();
}

export function showFieldLockTiles(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, THREE } = ctx;
  if (!tileMeshes || !THREE) return;
  clearFieldLockTiles();
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    tile.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._lockOrigMat = obj.material;
        obj.material = createLockMaterial(obj.material, THREE);
      }
    });
    state.tiles.push(tile);
  }
  if (state.tiles.length) startAnim();
}

export function clearFieldLockTiles() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.tiles.forEach(tile => {
    tile.traverse(obj => {
      if (obj.isMesh && obj.userData._lockOrigMat) {
        try { obj.material.dispose(); } catch {}
        obj.material = obj.userData._lockOrigMat;
        delete obj.userData._lockOrigMat;
      }
    });
  });
  state.tiles = [];
}

export default { showFieldLockTiles, clearFieldLockTiles };
