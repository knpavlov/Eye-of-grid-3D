// Подсветка клеток на поле для выбора цели
// Теперь вся поверхность клетки покрывается пульсирующим "водяным" сиянием,
// которое становится ярче и затем затухает каждые пару секунд.
import { getCtx } from './context.js';

// Внутреннее состояние активной подсветки
const state = {
  frames: [],
  uniforms: [],
  rafId: 0,
};

// Создаёт шейдерный материал с пульсацией и волнами
function createWaterPulseMaterial(THREE) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      float wave(vec2 p) {
        return sin(p.x * 10.0 + uTime * 3.0) * 0.5 +
               sin(p.y * 10.0 + uTime * 2.5) * 0.5;
      }
      void main() {
        float w = wave(vUv);
        float pulse = 0.5 + 0.5 * sin(uTime * 2.0); // цикл ~3с
        float alpha = pulse * (0.6 + 0.4 * w);
        vec3 base = vec3(0.2, 0.6, 1.0);
        vec3 color = base + base * w * 0.3;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
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

  const baseMat = createWaterPulseMaterial(THREE);

  for (const { r, c } of cells) {
    const frame = tileFrames?.[r]?.[c];
    if (!frame) continue;
    frame.traverse(obj => {
      if (obj.isMesh) {
        obj.userData._origMat = obj.material;
        obj.material = baseMat.clone();
        // Каждая копия имеет свой uniform, добавляем его для анимации
        if (obj.material.uniforms?.uTime) {
          state.uniforms.push(obj.material.uniforms.uTime);
        }
      }
    });
    state.frames.push(frame);
  }
  try { baseMat.dispose(); } catch {}
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
