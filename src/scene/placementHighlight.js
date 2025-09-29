// Мягкая подсветка клеток для призыва существ.
// Здесь только визуальный слой, логика выбора клеток находится в core/placementRules.
import { getCtx } from './context.js';

const state = {
  overlays: [],
  rafId: 0,
  baseGeometry: null,
};

function createOverlayMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xfcd34d) },
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
      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float dist = max(abs(centered.x), abs(centered.y));
        float edge = smoothstep(0.25, 0.98, dist);
        float soft = smoothstep(0.0, 0.4, dist);
        float shimmer = sin((centered.x + centered.y) * 6.0 + uTime * 1.6) * 0.05;
        float pulse = sin(uTime * 2.4) * 0.08 + 0.22;
        float intensity = edge * (0.35 + pulse + shimmer);
        intensity = max(intensity, 0.12 * (edge - soft));
        float alpha = clamp(intensity, 0.0, 0.42);
        if (alpha <= 0.01) discard;
        vec3 color = uColor * (0.7 + 0.3 * edge);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function ensureGeometry(THREE) {
  if (!state.baseGeometry) {
    state.baseGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  }
  return state.baseGeometry;
}

function placeOverlayOnTile({ THREE, tile, effectsGroup }) {
  const geometry = ensureGeometry(THREE);
  const material = createOverlayMaterial(THREE);
  const mesh = new THREE.Mesh(geometry, material);
  const width = tile?.geometry?.parameters?.width || tile?.scale?.x || 1;
  const depth = tile?.geometry?.parameters?.depth || tile?.scale?.z || 1;
  const height = tile?.geometry?.parameters?.height || tile?.scale?.y || 0.1;
  mesh.scale.set(width, depth, 1);
  mesh.rotation.x = -Math.PI / 2;
  const pos = tile.position.clone();
  pos.y += (height / 2) + 0.02;
  mesh.position.copy(pos);
  mesh.renderOrder = 720;
  effectsGroup.add(mesh);
  state.overlays.push({ mesh, material, uniform: material.uniforms.uTime });
}

function startAnimationLoop() {
  if (state.rafId) return;
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const step = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = (now - start) / 1000;
    for (const entry of state.overlays) {
      if (entry?.uniform) entry.uniform.value = t;
    }
    state.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(step)
      : setTimeout(step, 16);
  };
  step();
}

export function highlightPlacementTiles(cells = []) {
  const ctx = getCtx();
  const { THREE, tileMeshes, effectsGroup } = ctx;
  if (!THREE || !tileMeshes || !effectsGroup) return;
  clearPlacementHighlights();
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    placeOverlayOnTile({ THREE, tile, effectsGroup });
  }
  if (state.overlays.length) {
    startAnimationLoop();
  }
}

export function clearPlacementHighlights() {
  if (state.rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
    else clearTimeout(state.rafId);
    state.rafId = 0;
  }
  const ctx = getCtx();
  const { effectsGroup } = ctx;
  for (const entry of state.overlays) {
    try { effectsGroup?.remove(entry.mesh); } catch {}
    try { entry.material?.dispose?.(); } catch {}
  }
  state.overlays = [];
}

export default {
  highlightPlacementTiles,
  clearPlacementHighlights,
};
