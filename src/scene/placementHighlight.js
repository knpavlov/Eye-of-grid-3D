// Подсветка доступных клеток для призыва: яркая белая рамка и «волны» вдоль вертикальных граней.
// Модуль концентрируется только на визуальном эффекте, все расчёты доступных координат живут в логике взаимодействий.

import { getCtx } from './context.js';

const state = {
  overlays: [],
  uniforms: [],
  rafId: 0,
  planeGeometry: null,
};

function pushUniform(uniform) {
  if (uniform && !state.uniforms.includes(uniform)) {
    state.uniforms.push(uniform);
  }
}

// Общая плоскость, которую позже масштабируем под конкретную сторону/основание клетки
function ensurePlaneGeometry(THREE) {
  if (!state.planeGeometry) {
    state.planeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  }
  return state.planeGeometry;
}

// Материал для вертикальных стенок: бегущие вверх полосы, постепенно затухающие
function createWaveMaterial(THREE) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
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
      uniform float uIntensity;
      void main() {
        float distToEdge = smoothstep(0.5, 0.2, abs(vUv.x - 0.5));
        float wave = fract(vUv.y * 3.2 - uTime * 1.1);
        float waveFade = smoothstep(0.0, 0.25, wave) * smoothstep(1.0, 0.75, wave);
        float tail = smoothstep(1.0, 0.3, vUv.y);
        float brightness = mix(0.35, 1.0, waveFade) * tail * uIntensity;
        float alpha = brightness * distToEdge;
        vec3 color = vec3(1.0);
        gl_FragColor = vec4(color * brightness, alpha);
        if (gl_FragColor.a <= 0.01) discard;
      }
    `,
  });
  pushUniform(material.uniforms.uTime);
  return material;
}

// Тонкая подсветка на поверхности клетки, чтобы усилить восприятие рамки
function createBaseRimMaterial(THREE) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
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
      void main() {
        vec2 centered = abs(vUv - vec2(0.5));
        float rimX = smoothstep(0.44, 0.34, centered.x);
        float rimY = smoothstep(0.44, 0.34, centered.y);
        float rim = rimX + rimY;
        float ripple = 0.45 + 0.35 * sin(uTime * 2.4);
        float alpha = clamp(rim * 0.55 * ripple, 0.0, 1.0);
        vec3 color = vec3(1.0);
        gl_FragColor = vec4(color, alpha);
        if (gl_FragColor.a <= 0.01) discard;
      }
    `,
  });
  pushUniform(material.uniforms.uTime);
  return material;
}

function createFrameGroup(THREE, tile) {
  if (!tile) return null;
  const planeGeometry = ensurePlaneGeometry(THREE);
  const waveMaterial = createWaveMaterial(THREE);
  const baseMaterial = createBaseRimMaterial(THREE);

  const width = tile?.geometry?.parameters?.width || 6.2;
  const depth = tile?.geometry?.parameters?.depth || 6.2;
  const frameThickness = Math.min(width, depth) * 0.085;
  const waveHeight = Math.max(width, depth) * 0.95;

  const group = new THREE.Group();

  // Горизонтальная рамка на уровне клетки
  const baseMesh = new THREE.Mesh(planeGeometry, baseMaterial);
  baseMesh.rotation.x = -Math.PI / 2;
  baseMesh.scale.set(width * 0.98, depth * 0.98, 1);
  group.add(baseMesh);

  // Четыре вертикальные стенки с бегущими волнами
  const sides = [
    { axis: 'z', dir: 1, rotY: 0 },
    { axis: 'z', dir: -1, rotY: Math.PI },
    { axis: 'x', dir: 1, rotY: -Math.PI / 2 },
    { axis: 'x', dir: -1, rotY: Math.PI / 2 },
  ];

  sides.forEach(({ axis, dir, rotY }) => {
    const mesh = new THREE.Mesh(planeGeometry, waveMaterial);
    mesh.scale.set(frameThickness, waveHeight, 1);
    mesh.position.y = waveHeight * 0.5;
    mesh.rotation.y = rotY;
    if (axis === 'z') {
      mesh.scale.x = frameThickness;
      mesh.scale.y = waveHeight;
      mesh.position.z = (depth / 2) * dir;
    } else {
      mesh.scale.x = frameThickness;
      mesh.scale.y = waveHeight;
      mesh.position.x = (width / 2) * dir;
    }
    group.add(mesh);
  });

  group.renderOrder = 560;
  return group;
}

function placeOverlayOnTile(tile, group) {
  const ctx = getCtx();
  const { tileFrames } = ctx;
  if (!tile || !group) return null;
  group.position.copy(tile.position);
  try {
    const frameSegment = tileFrames?.[tile.userData.row]?.[tile.userData.col]?.children?.[0];
    const baseY = frameSegment?.position?.y ?? (tile.position.y + (tile.geometry?.parameters?.height || 0) / 2);
    group.position.y = baseY + 0.01;
  } catch {
    group.position.y = tile.position.y + 0.01;
  }
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

function disposeOverlay(group) {
  if (!group) return;
  try { group.removeFromParent?.(); } catch {}
  const materials = new Set();
  group.traverse?.(obj => {
    if (obj?.isMesh && obj.material) {
      materials.add(obj.material);
    }
  });
  materials.forEach(material => {
    try { material.dispose?.(); } catch {}
  });
}

export function highlightPlacement(cells = []) {
  clearPlacementHighlights();
  const ctx = getCtx();
  const { THREE, tileMeshes } = ctx;
  if (!THREE || !Array.isArray(tileMeshes)) return;
  for (const { r, c } of cells) {
    const tile = tileMeshes?.[r]?.[c];
    if (!tile) continue;
    const group = createFrameGroup(THREE, tile);
    if (!group) continue;
    const placed = placeOverlayOnTile(tile, group);
    if (!placed) {
      disposeOverlay(group);
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
  state.uniforms = [];
  state.overlays.forEach(group => disposeOverlay(group));
  state.overlays = [];
}

try {
  if (typeof window !== 'undefined') {
    window.__placementHighlight = { highlightPlacement, clearPlacementHighlights };
  }
} catch {}

export default { highlightPlacement, clearPlacementHighlights };
