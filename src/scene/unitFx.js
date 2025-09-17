// Эффекты, связанные с визуализацией конкретных юнитов (невидимость и т.п.)
// Логика анимаций вынесена отдельно от основного рендера, чтобы облегчить
// повторное использование при переносе на другие движки.

import { getCtx } from './context.js';

const activeInvisibilityFx = new Set();
let rafId = null;

function ensureLoop() {
  if (typeof window === 'undefined') return;
  if (rafId !== null) return;
  let last = performance.now();
  const step = (now) => {
    const delta = Math.max(0, (now - last) / 1000);
    last = now;
    for (const fx of activeInvisibilityFx) {
      try {
        if (fx.uniforms?.uTime) {
          fx.uniforms.uTime.value += delta;
          if (fx.uniforms.uTime.value > 1000) {
            fx.uniforms.uTime.value = fx.uniforms.uTime.value % 1000;
          }
        }
      } catch {}
    }
    if (activeInvisibilityFx.size > 0) {
      rafId = window.requestAnimationFrame(step);
    } else {
      rafId = null;
    }
  };
  rafId = window.requestAnimationFrame(step);
}

function stopLoopIfNeeded() {
  if (typeof window === 'undefined') return;
  if (activeInvisibilityFx.size === 0 && rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function createShaderOverlay(THREE, mesh) {
  const width = mesh?.geometry?.parameters?.width || 4.8;
  const depth = mesh?.geometry?.parameters?.depth || 5.6;
  const height = mesh?.geometry?.parameters?.height || 0.12;
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.45 },
    uColor: { value: new THREE.Color(0.65, 0.8, 1.0) },
  };
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uColor;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      float wave = sin((vUv.x + vUv.y + uTime * 0.6) * 6.2831);
      float wave2 = sin((vUv.x * 4.0 - uTime * 0.8) + sin(vUv.y * 3.0 + uTime * 0.9));
      float flicker = hash(vUv * 12.0 + uTime);
      float intensity = 0.45 + 0.55 * wave * wave2 + 0.1 * flicker;
      float alpha = clamp(uOpacity * intensity, 0.0, 0.75);
      gl_FragColor = vec4(uColor, alpha);
    }
  `;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const geometry = new THREE.PlaneGeometry(width * 1.04, depth * 1.04);
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, height / 2 + 0.08, 0);
  plane.renderOrder = (mesh.renderOrder || 1200) + 5;
  return { plane, geometry, material, uniforms };
}

function makeMaterialsTransparent(mesh) {
  const entries = [];
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    const prev = {
      mat,
      transparent: mat.transparent,
      opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
    };
    entries.push(prev);
    if (typeof mat.opacity === 'number') {
      mat.opacity = Math.min(prev.opacity, 0.68);
    }
    mat.transparent = true;
    mat.needsUpdate = true;
  }
  const faceOverlay = mesh.children?.find(ch => ch.userData?.kind === 'faceOverlay');
  let overlayPrev = null;
  if (faceOverlay?.material) {
    const mat = faceOverlay.material;
    overlayPrev = {
      mat,
      transparent: mat.transparent,
      opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
    };
    mat.transparent = true;
    if (typeof mat.opacity === 'number') {
      mat.opacity = Math.min(mat.opacity, 0.55);
    } else {
      mat.opacity = 0.55;
    }
    mat.needsUpdate = true;
  }
  return { materials: entries, overlay: overlayPrev };
}

function restoreMaterials(data) {
  if (!data) return;
  for (const entry of data.materials || []) {
    try {
      entry.mat.transparent = entry.transparent;
      if (typeof entry.mat.opacity === 'number') {
        entry.mat.opacity = entry.opacity;
      }
      entry.mat.needsUpdate = true;
    } catch {}
  }
  if (data.overlay?.mat) {
    try {
      data.overlay.mat.transparent = data.overlay.transparent;
      if (typeof data.overlay.mat.opacity === 'number') {
        data.overlay.mat.opacity = data.overlay.opacity;
      }
      data.overlay.mat.needsUpdate = true;
    } catch {}
  }
}

export function setInvisibilityFx(mesh, enabled) {
  if (!mesh) return;
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) return;
  const current = mesh.userData?.__invisibilityFx;
  if (enabled) {
    if (current) return;
    const overlay = createShaderOverlay(THREE, mesh);
    if (!overlay?.plane) return;
    mesh.add(overlay.plane);
    const stored = makeMaterialsTransparent(mesh);
    const fx = {
      mesh,
      overlay,
      stored,
      uniforms: overlay.uniforms,
    };
    mesh.userData.__invisibilityFx = fx;
    activeInvisibilityFx.add(fx);
    ensureLoop();
  } else {
    if (!current) return;
    try {
      if (current.overlay?.plane && current.overlay.plane.parent === mesh) {
        mesh.remove(current.overlay.plane);
      }
    } catch {}
    try { current.overlay?.geometry?.dispose?.(); } catch {}
    try { current.overlay?.material?.dispose?.(); } catch {}
    restoreMaterials(current.stored);
    activeInvisibilityFx.delete(current);
    delete mesh.userData.__invisibilityFx;
    stopLoopIfNeeded();
  }
}
