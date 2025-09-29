// Подсветка клеток для допустимых призывов.
// Эффект реализован отдельными наложениями поверх клеток, чтобы не вмешиваться в логику игры.
import { getCtx } from './context.js';

const overlayState = {
  overlays: [],
  uniforms: [],
  rafId: 0,
  geometry: null,
};

function ensureGeometry(THREE) {
  if (overlayState.geometry) return overlayState.geometry;
  const radius = 0.72;
  overlayState.geometry = new THREE.CircleGeometry(radius, 48);
  return overlayState.geometry;
}

function createOverlayMaterial(THREE) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x38bdf8) },
      uInner: { value: 0.08 },
      uEdge: { value: 0.55 },
      uRingBoost: { value: 0.28 },
    },
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
      uniform vec3 uColor;
      uniform float uInner;
      uniform float uEdge;
      uniform float uRingBoost;
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float dist = length(uv);
        float edge = smoothstep(0.25, 0.9, dist);
        float ring = smoothstep(0.78, 0.98, dist);
        float baseAlpha = mix(uInner, uEdge, edge);
        float pulse = 0.82 + 0.18 * sin(uTime * 2.6 + dist * 3.5);
        float alpha = clamp(baseAlpha * pulse + ring * uRingBoost, 0.0, 1.0);
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  overlayState.uniforms.push(material.uniforms.uTime);
  return material;
}

function addOverlayForTile(tile, THREE) {
  if (!tile) return null;
  const geom = ensureGeometry(THREE);
  const material = createOverlayMaterial(THREE);
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;
  const worldPos = tile.position.clone();
  mesh.position.copy(worldPos);
  mesh.position.y += 0.015;
  mesh.renderOrder = 5;
  return mesh;
}

function startAnimation() {
  if (overlayState.rafId) return;
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const tick = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = (now - start) / 1000;
    overlayState.uniforms.forEach(u => { if (u) u.value = t; });
    overlayState.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16);
  };
  tick();
}

function stopAnimation() {
  if (!overlayState.rafId) return;
  if (typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(overlayState.rafId);
  } else {
    clearTimeout(overlayState.rafId);
  }
  overlayState.rafId = 0;
}

function disposeOverlay(mesh) {
  if (!mesh) return;
  if (mesh.parent) {
    try { mesh.parent.remove(mesh); } catch {}
  }
  if (mesh.material && typeof mesh.material.dispose === 'function') {
    try { mesh.material.dispose(); } catch {}
  }
}

export function highlightSummonCells(cells = []) {
  const ctx = getCtx();
  const { tileMeshes, effectsGroup, THREE, scene } = ctx;
  if (!Array.isArray(cells) || !cells.length) {
    clearSummonHighlights();
    return;
  }
  if (!tileMeshes || !THREE) return;
  clearSummonHighlights();
  const parent = effectsGroup || scene;
  if (!parent) return;
  for (const cell of cells) {
    if (!cell) continue;
    const { r, c } = cell;
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const overlay = addOverlayForTile(tile, THREE);
    if (!overlay) continue;
    parent.add(overlay);
    overlayState.overlays.push(overlay);
  }
  if (overlayState.overlays.length) {
    startAnimation();
  }
}

export function clearSummonHighlights() {
  stopAnimation();
  overlayState.uniforms = [];
  overlayState.overlays.forEach(mesh => disposeOverlay(mesh));
  overlayState.overlays = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__summonHighlight = { highlightSummonCells, clearSummonHighlights };
  }
} catch {}

export default { highlightSummonCells, clearSummonHighlights };
