// Визуализация статуса невидимости через шейдерную дымку
import { getCtx } from './context.js';

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available for invisibility effect');
  return THREE;
}

function storeOriginalMaterials(unitMesh) {
  if (!unitMesh) return;
  if (!unitMesh.userData) unitMesh.userData = {};
  if (unitMesh.userData.__invisibilityOriginal) return;
  const materials = Array.isArray(unitMesh.material)
    ? unitMesh.material
    : [unitMesh.material];
  unitMesh.userData.__invisibilityOriginal = materials
    .filter(Boolean)
    .map(mat => ({
      mat,
      transparent: mat.transparent,
      opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
      depthWrite: mat.depthWrite,
    }));
}

function restoreOriginalMaterials(unitMesh) {
  if (!unitMesh?.userData?.__invisibilityOriginal) return;
  for (const entry of unitMesh.userData.__invisibilityOriginal) {
    if (!entry?.mat) continue;
    entry.mat.transparent = entry.transparent;
    entry.mat.opacity = entry.opacity;
    if (typeof entry.depthWrite === 'boolean') entry.mat.depthWrite = entry.depthWrite;
    entry.mat.needsUpdate = true;
  }
  delete unitMesh.userData.__invisibilityOriginal;
}

function createInvisibilityOverlay(unitMesh) {
  const THREE = getTHREE();
  const baseGeom = unitMesh?.geometry;
  const width = baseGeom?.parameters?.width ?? 4.8;
  const thickness = baseGeom?.parameters?.height ?? 0.12;
  const depth = baseGeom?.parameters?.depth ?? 5.6;
  const geometry = new THREE.BoxGeometry(width * 1.04, thickness * 1.35, depth * 1.04);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending || THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x8ecae6) },
      uOpacity: { value: 0.45 },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      float wave(vec2 uv, float speed, float scale) {
        return sin((uv.x * scale) + uTime * speed) * 0.5 + sin((uv.y * scale * 1.2) - uTime * speed * 0.8) * 0.5;
      }
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float swirl = wave(uv, 1.2, 5.2) + wave(uv.yx, 0.8, 4.4);
        float alpha = clamp(uOpacity * (0.45 + 0.3 * swirl), 0.05, 0.6);
        if (alpha <= 0.01) discard;
        float tint = 0.6 + 0.4 * sin(uTime * 0.9 + uv.y * 6.2831);
        vec3 color = uColor * tint;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const overlay = new THREE.Mesh(geometry, material);
  overlay.renderOrder = (unitMesh.renderOrder || 1200) + 10;
  overlay.onBeforeRender = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    material.uniforms.uTime.value = now / 1000;
  };
  overlay.userData.__invisibilityOverlayMaterial = material;
  overlay.userData.__invisibilityOverlayGeometry = geometry;
  return overlay;
}

export function applyInvisibilityEffect(unitMesh) {
  if (!unitMesh) return null;
  if (!unitMesh.userData) unitMesh.userData = {};
  if (unitMesh.userData.invisibilityEffect) return unitMesh.userData.invisibilityEffect;
  storeOriginalMaterials(unitMesh);
  const mats = Array.isArray(unitMesh.material) ? unitMesh.material : [unitMesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    mat.transparent = true;
    const baseOpacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
    mat.opacity = Math.min(baseOpacity, 0.75);
    if (typeof mat.depthWrite === 'boolean') mat.depthWrite = false;
    mat.needsUpdate = true;
  }
  const overlay = createInvisibilityOverlay(unitMesh);
  try { unitMesh.add(overlay); } catch {}
  unitMesh.userData.invisibilityEffect = overlay;
  return overlay;
}

export function removeInvisibilityEffect(unitMesh) {
  if (!unitMesh) return;
  const overlay = unitMesh.userData?.invisibilityEffect;
  if (overlay) {
    try { unitMesh.remove(overlay); } catch {}
    const mat = overlay.userData?.__invisibilityOverlayMaterial || overlay.material;
    const geom = overlay.userData?.__invisibilityOverlayGeometry || overlay.geometry;
    try { mat?.dispose?.(); } catch {}
    try { geom?.dispose?.(); } catch {}
    delete unitMesh.userData.invisibilityEffect;
  }
  restoreOriginalMaterials(unitMesh);
}

try {
  if (typeof window !== 'undefined') {
    window.__scene = window.__scene || {};
    window.__scene.invisibility = { applyInvisibilityEffect, removeInvisibilityEffect };
  }
} catch {}
