// Волновая подсветка доступных клеток для призыва существ.
// Модуль остаётся самостоятельным: логика передаёт только координаты, визуальный эффект управляется здесь.

import { getCtx } from './context.js';

const state = {
  overlays: [],
  uniforms: [],
  rafId: 0,
  edgeGeometry: null,
};

// Создаёт шейдерный материал с белой рамкой и пульсирующими волнами, уходящими вверх.
function createOverlayMaterial(THREE) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 10 },
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

      float wavePulse(float offset) {
        float speed = 0.78;
        float density = 0.95;
        float pos = fract(vUv.y * density - uTime * speed + offset + uSeed);
        float front = smoothstep(0.0, 0.18, 1.0 - pos);
        float tail = smoothstep(0.58, 0.24, pos);
        return front * tail;
      }

      void main() {
        float baseGlow = smoothstep(1.0, 0.8, vUv.y);
        float wave = wavePulse(0.0);
        float fadeTop = smoothstep(1.0, 0.47, vUv.y);
        float lateral = smoothstep(0.0, 0.018, vUv.x) * smoothstep(0.0, 0.018, 1.0 - vUv.x);
        // Уменьшаем заметность рамки: меньше вклад от базового свечения и волн.
        float intensity = (baseGlow * 0.45 + wave * 1.1) * fadeTop * lateral * 0.58;
        float alpha = clamp(intensity, 0.0, 1.0);
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
  });
  material.toneMapped = false;
  return material;
}

function ensureEdgeGeometry(THREE) {
  if (!state.edgeGeometry) {
    state.edgeGeometry = new THREE.PlaneGeometry(1, 1, 1, 28);
  }
  return state.edgeGeometry;
}

// Формирует группу из четырёх вертикальных граней-рамок вокруг клетки.
function createFrameGroup(tile, material) {
  const ctx = getCtx();
  const { THREE, tileFrames } = ctx;
  if (!THREE || !tile) return null;

  const geometry = ensureEdgeGeometry(THREE);
  const group = new THREE.Group();
  group.renderOrder = 580;

  const width = tile?.geometry?.parameters?.width || 6.2;
  const depth = tile?.geometry?.parameters?.depth || 6.2;
  const tileHeight = tile?.geometry?.parameters?.height || 0;
  const frameHeight = Math.max(width, depth) * 0.065;

  let baseY = tile.position.y + tileHeight / 2;
  try {
    const frameSegment = tileFrames?.[tile.userData.row]?.[tile.userData.col]?.children?.[0];
    if (frameSegment?.position?.y !== undefined) {
      baseY = frameSegment.position.y;
    }
  } catch {}

  group.position.set(tile.position.x, baseY + 0.02, tile.position.z);

  const createEdge = (length) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(length, frameHeight, 1);
    mesh.position.y = frameHeight / 2;
    mesh.frustumCulled = false;
    return mesh;
  };

  const north = createEdge(width);
  north.position.z = depth / 2;

  const south = createEdge(width);
  south.position.z = -depth / 2;
  south.rotation.y = Math.PI;

  const east = createEdge(depth);
  east.position.x = width / 2;
  east.rotation.y = -Math.PI / 2;

  const west = createEdge(depth);
  west.position.x = -width / 2;
  west.rotation.y = Math.PI / 2;

  group.add(north, south, east, west);

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

function disposeOverlay(entry) {
  if (!entry) return;
  const { group, material } = entry;
  try { group.removeFromParent?.(); } catch {}
  try { group.clear?.(); } catch {}
  try { material?.dispose?.(); } catch {}
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
    const group = createFrameGroup(tile, material);
    if (!group) {
      try { material.dispose(); } catch {}
      continue;
    }
    state.uniforms.push(material.uniforms.uTime);
    state.overlays.push({ group, material });
  }
  if (state.overlays.length) {
    startAnim();
  }
}

export function clearPlacementHighlights() {
  stopAnim();
  state.uniforms = [];
  state.overlays.forEach(entry => disposeOverlay(entry));
  state.overlays = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__placementHighlight = { highlightPlacement, clearPlacementHighlights };
  }
} catch {}

export default { highlightPlacement, clearPlacementHighlights };
