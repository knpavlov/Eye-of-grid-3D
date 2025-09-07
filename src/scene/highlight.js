// Подсветка клеток на поле для выбора цели
// Использует шейдерный материал с простым "магическим" сиянием
// вокруг границ клетки.
import { getCtx } from './context.js';

// Внутреннее состояние активной подсветки
const state = {
  frames: [],
  uniforms: [],
  rafId: 0,
};

// Создаёт материал для рамки с анимированными лучами
function createMagicMaterial(THREE) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUv = uv;');
    const fragHead = `\n varying vec2 vUv;\n uniform float uTime;\n`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + fragHead)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n{
          float wave = sin((vUv.x + vUv.y + uTime*2.0)*10.0)*0.5 + 0.5;
          vec3 glow = vec3(0.5,0.8,1.0) * wave;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, glow, 0.7);
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
  const { tileFrames, THREE } = ctx;
  if (!tileFrames || !THREE) return;

  clearHighlights();

  const baseMat = createMagicMaterial(THREE);

  for (const { r, c } of cells) {
    const frame = tileFrames?.[r]?.[c];
    if (!frame) continue;
    frame.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._origMat = obj.material;
        obj.material = baseMat.clone();
      }
    });
    state.frames.push(frame);
  }
  startAnim();
}

// Сброс подсветки
export function clearHighlights() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  state.uniforms = [];
  state.frames.forEach(frame => {
    frame.traverse(obj => {
      if (obj.isMesh && obj.userData._origMat) {
        try { obj.material.dispose(); } catch {}
        obj.material = obj.userData._origMat;
        delete obj.userData._origMat;
      }
    });
  });
  state.frames = [];
}

// Экспорт в глобальную область для отладки
try { if (typeof window !== 'undefined') { window.__tileHighlight = { highlightTiles, clearHighlights }; } } catch {}

export default { highlightTiles, clearHighlights };
