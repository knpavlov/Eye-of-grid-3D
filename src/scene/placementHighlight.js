// Световые рамки для обозначения доступных клеток призыва.
// Логика подсветки и её шейдер вынесены в отдельный модуль для упрощения замены движка.

import { getCtx } from './context.js';

const state = {
  overlays: [],
  materials: [],
  timeUniforms: [],
  rafId: 0,
  geometryCache: new Map(),
};

function createWaveMaterial(THREE) {
  const seed = Math.random();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uColor: { value: new THREE.Color(0xffffff) },
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
      uniform float uSeed;
      uniform vec3 uColor;

      float wave(float shift) {
        float center = fract(shift);
        float dist = abs(vUv.y - center);
        float band = smoothstep(0.22, 0.0, dist);
        return band;
      }

      void main() {
        float speed = mix(0.85, 1.45, fract(uSeed * 17.0));
        float envelope = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
        float pulses = wave(uTime * speed) + wave(uTime * speed + 0.5);
        float baseGlow = smoothstep(0.0, 0.02, vUv.y) * 0.7;
        float lateralFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.x);
        float intensity = (pulses * envelope + baseGlow) * lateralFade;
        intensity = clamp(intensity, 0.0, 1.0);
        vec3 color = uColor * (0.9 + 0.1 * smoothstep(0.0, 0.2, vUv.y));
        float alpha = pow(intensity, 0.72);
        gl_FragColor = vec4(color, alpha);
        if (gl_FragColor.a < 0.02) discard;
      }
    `,
  });

  state.timeUniforms.push(material.uniforms.uTime);
  state.materials.push(material);
  return material;
}

function getTileMetrics(tile) {
  const width = tile?.geometry?.parameters?.width || 6.2;
  const depth = tile?.geometry?.parameters?.depth || 6.2;
  const frameHeight = Math.max(width, depth) * 0.72;
  return { width, depth, frameHeight };
}

function ensureGeometries(THREE, metrics) {
  const key = `${metrics.width.toFixed(3)}|${metrics.depth.toFixed(3)}|${metrics.frameHeight.toFixed(3)}`;
  if (state.geometryCache.has(key)) return state.geometryCache.get(key);

  const geoX = new THREE.PlaneGeometry(metrics.width, metrics.frameHeight, 1, 1);
  const geoZ = new THREE.PlaneGeometry(metrics.depth, metrics.frameHeight, 1, 1);
  const cached = { geoX, geoZ };
  state.geometryCache.set(key, cached);
  return cached;
}

function resolveBaseY(tile) {
  try {
    const ctx = getCtx();
    const frameSegment = ctx.tileFrames?.[tile.userData.row]?.[tile.userData.col]?.children?.[0];
    const frameY = frameSegment?.position?.y;
    if (typeof frameY === 'number') return frameY;
  } catch {}
  const tileHeight = tile?.geometry?.parameters?.height || 0;
  return tile.position.y + tileHeight / 2;
}

function buildFrameGroup(THREE, tile, material) {
  if (!tile) return null;
  const metrics = getTileMetrics(tile);
  const { geoX, geoZ } = ensureGeometries(THREE, metrics);

  const group = new THREE.Group();
  group.renderOrder = 560;

  const margin = Math.min(metrics.width, metrics.depth) * 0.04;
  const lift = 0.03;
  const halfHeight = metrics.frameHeight / 2;
  const halfWidth = metrics.width / 2;
  const halfDepth = metrics.depth / 2;

  const edges = [
    { geometry: geoX, position: [0, halfHeight, halfDepth + margin], rotation: [0, 0, 0] },
    { geometry: geoX, position: [0, halfHeight, -halfDepth - margin], rotation: [0, Math.PI, 0] },
    { geometry: geoZ, position: [halfWidth + margin, halfHeight, 0], rotation: [0, Math.PI / 2, 0] },
    { geometry: geoZ, position: [-halfWidth - margin, halfHeight, 0], rotation: [0, -Math.PI / 2, 0] },
  ];

  for (const edge of edges) {
    const mesh = new THREE.Mesh(edge.geometry, material);
    mesh.position.set(...edge.position);
    mesh.rotation.set(...edge.rotation);
    group.add(mesh);
  }

  group.position.copy(tile.position);
  group.position.y = resolveBaseY(tile) + lift;
  return group;
}

function placeOverlayOnTile(tile, material) {
  const ctx = getCtx();
  const { THREE } = ctx;
  if (!THREE) return null;

  const group = buildFrameGroup(THREE, tile, material);
  if (!group) return null;

  const parent = ctx.effectsGroup || ctx.boardGroup;
  parent?.add(group);
  return group;
}

function startAnim() {
  if (state.rafId) return;
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function tick() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = (now - start) / 1000;
    state.timeUniforms.forEach(u => { if (u) u.value = t; });
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

function disposeOverlay(group) {
  if (!group) return;
  try { group.removeFromParent?.(); } catch {}
}

export function highlightPlacement(cells = []) {
  clearPlacementHighlights();
  const ctx = getCtx();
  const { THREE, tileMeshes } = ctx;
  if (!THREE || !Array.isArray(tileMeshes)) return;

  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const material = createWaveMaterial(THREE);
    const group = placeOverlayOnTile(tile, material);
    if (!group) {
      state.timeUniforms.pop();
      const disposed = state.materials.pop();
      try { (disposed || material).dispose(); } catch {}
      continue;
    }
    state.overlays.push(group);
  }

  if (state.overlays.length) {
    startAnim();
  }
}

export function clearPlacementHighlights() {
  stopAnim();
  state.timeUniforms = [];
  state.overlays.forEach(group => disposeOverlay(group));
  state.overlays = [];
  state.materials.forEach(mat => { try { mat.dispose(); } catch {} });
  state.materials = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__placementHighlight = { highlightPlacement, clearPlacementHighlights };
  }
} catch {}

export default { highlightPlacement, clearPlacementHighlights };
