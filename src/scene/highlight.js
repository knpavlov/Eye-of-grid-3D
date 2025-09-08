// Подсветка клеток на поле для выбора цели
// Теперь вместо тонкой рамки поверх клетки
// создаётся пульсирующая водяная плёнка,
// полностью покрывающая ячейку.
import { getCtx } from './context.js';

// Внутреннее состояние активной подсветки
// overlays — плоские меши поверх тайлов
const state = {
  overlays: [],
  uniforms: [],
  rafId: 0,
};

// Создаёт материал с пульсирующим эффектом воды
function createPulseMaterial(THREE) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main(){
        float wave = sin((vUv.x*4.0 + uTime*1.5)*3.14159) * cos((vUv.y*4.0 - uTime*1.3)*3.14159);
        float pulse = 0.5 + 0.5 * sin(uTime * 2.0 * 3.14159 / 2.5); // цикл ~2.5с
        vec3 base = vec3(0.3,0.7,1.0);
        vec3 col = base + wave*0.15;
        gl_FragColor = vec4(col, pulse*0.8);
      }
    `,
  });
  state.uniforms.push(mat.uniforms.uTime);
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
  const { tileMeshes, boardGroup, THREE } = ctx;
  if (!tileMeshes || !boardGroup || !THREE) return;

  clearHighlights();

  const baseMat = createPulseMaterial(THREE);

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const size = tile.geometry?.parameters?.width || 6.2;
    const h = tile.geometry?.parameters?.height || 0.35;
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      baseMat.clone()
    );
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(tile.position.x, tile.position.y + h / 2 + 0.01, tile.position.z);
    overlay.renderOrder = 900;
    boardGroup.add(overlay);
    state.overlays.push(overlay);
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
  const ctx = getCtx();
  const { boardGroup } = ctx;
  state.uniforms = [];
  state.overlays.forEach(ov => {
    try { boardGroup.remove(ov); } catch {}
    try { ov.geometry.dispose(); } catch {}
    try { ov.material.dispose(); } catch {}
  });
  state.overlays = [];
}

// Экспорт в глобальную область для отладки
try { if (typeof window !== 'undefined') { window.__tileHighlight = { highlightTiles, clearHighlights }; } } catch {}

export default { highlightTiles, clearHighlights };
