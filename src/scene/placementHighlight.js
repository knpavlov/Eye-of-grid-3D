// Мягкая подсветка доступных клеток для призыва существ.
// Визуальная часть отделена от логики: модуль принимает список клеток и сам управляет мешами-подсветками.

import { getCtx } from './context.js';

const state = {
  overlays: [],
  uniforms: [],
  rafId: 0,
  geometry: null,
};

// Создаёт шейдерный материал с плавным затуханием к центру
function createOverlayMaterial(THREE) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x38bdf8) },
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
        vec2 centered = vUv - vec2(0.5);
        float dist = length(centered * 1.35);
        float ring = smoothstep(0.18, 0.95, dist);
        float fade = 1.0 - smoothstep(0.98, 1.4, dist);
        float mask = clamp(ring * fade, 0.0, 1.0);
        float pulse = 0.6 + 0.4 * sin(uTime * 1.8);
        float alpha = mask * 0.42 * pulse;
        vec3 color = mix(vec3(0.1, 0.4, 0.55), uColor, mask);
        gl_FragColor = vec4(color, alpha);
        if (gl_FragColor.a <= 0.01) discard;
      }
    `,
  });
  state.uniforms.push(material.uniforms.uTime);
  return material;
}

function ensureGeometry(THREE, tile) {
  if (state.geometry) return state.geometry;
  const width = tile?.geometry?.parameters?.width || 6.2;
  const depth = tile?.geometry?.parameters?.depth || 6.2;
  state.geometry = new THREE.PlaneGeometry(width * 0.94, depth * 0.94, 1, 1);
  return state.geometry;
}

function placeOverlayOnTile(tile, material) {
  const ctx = getCtx();
  const { THREE, tileFrames } = ctx;
  if (!THREE || !tile) return null;
  const geometry = ensureGeometry(THREE, tile);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 550;
  mesh.position.copy(tile.position);
  try {
    const frameSegment = tileFrames?.[tile.userData.row]?.[tile.userData.col]?.children?.[0];
    const baseY = frameSegment?.position?.y ?? (tile.position.y + (tile.geometry?.parameters?.height || 0) / 2);
    mesh.position.y = baseY + 0.02;
  } catch {
    mesh.position.y = tile.position.y + 0.02;
  }
  const parent = ctx.effectsGroup || ctx.boardGroup;
  parent?.add(mesh);
  return mesh;
}

function startAnim() {
  if (state.rafId) return;
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function tick() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = (now - start) / 1000;
    state.uniforms.forEach(u => { if (u) u.value = t; });
    state.rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16);
  }
  tick();
}

function stopAnim() {
  if (!state.rafId) return;
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(state.rafId);
  else clearTimeout(state.rafId);
  state.rafId = 0;
}

function disposeOverlay(mesh) {
  if (!mesh) return;
  try { mesh.removeFromParent?.(); } catch {}
  try { mesh.material?.dispose?.(); } catch {}
}

export function highlightPlacement(cells = []) {
  clearPlacementHighlights();
  const ctx = getCtx();
  const { THREE, tileMeshes } = ctx;
  if (!THREE || !Array.isArray(tileMeshes)) return;
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const material = createOverlayMaterial(THREE);
    const mesh = placeOverlayOnTile(tile, material);
    if (!mesh) {
      try { material.dispose(); } catch {}
      continue;
    }
    state.overlays.push(mesh);
  }
  if (state.overlays.length) {
    startAnim();
  }
}

export function clearPlacementHighlights() {
  stopAnim();
  state.uniforms = [];
  state.overlays.forEach(mesh => disposeOverlay(mesh));
  state.overlays = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__placementHighlight = { highlightPlacement, clearPlacementHighlights };
  }
} catch {}

export default { highlightPlacement, clearPlacementHighlights };
