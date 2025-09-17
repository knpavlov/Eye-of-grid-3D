// Эффект невидимости для 3D-карт: лёгкая прозрачность и мерцающая дымка
import { getCtx } from './context.js';

const ACTIVE_OVERLAYS = new WeakMap();

function ensureTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

function collectMaterials(mesh) {
  if (!mesh) return [];
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.filter(Boolean);
}

export function applyInvisibilityEffect(mesh) {
  try {
    if (!mesh) return;
    const THREE = ensureTHREE();
    if (ACTIVE_OVERLAYS.has(mesh)) {
      // Уже применён — ничего не делаем, но обновим время
      const stored = ACTIVE_OVERLAYS.get(mesh);
      if (stored?.uniforms) {
        stored.uniforms.uTime.value = performance.now() / 1000;
      }
      return;
    }

    const originals = [];
    for (const mat of collectMaterials(mesh)) {
      originals.push({ mat, transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
      mat.transparent = true;
      const targetOpacity = typeof mat.opacity === 'number' ? Math.min(mat.opacity, 0.55) : 0.55;
      mat.opacity = targetOpacity;
      mat.depthWrite = false;
    }

    const geomParams = mesh.geometry?.parameters || {};
    const width = geomParams.width || 4.8;
    const height = geomParams.height || 0.12;
    const depth = geomParams.depth || 5.6;

    const overlayGeom = new THREE.PlaneGeometry(width * 1.05, depth * 1.05);
    const uniforms = {
      uTime: { value: performance.now() / 1000 },
      uBaseAlpha: { value: 0.32 },
      uTint: { value: new THREE.Color(0x9bd7ff) },
    };
    const overlayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: `varying vec2 vUv;\nvoid main(){\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n}`,
      fragmentShader: `uniform float uTime;\nuniform float uBaseAlpha;\nuniform vec3 uTint;\nvarying vec2 vUv;\nvoid main(){\n  float wave = sin((vUv.x + uTime * 0.6) * 8.0) * 0.18;\n  wave += sin((vUv.y - uTime * 0.45) * 9.0) * 0.15;\n  float alpha = clamp(uBaseAlpha + wave, 0.08, 0.45);\n  gl_FragColor = vec4(uTint, alpha);\n}`,
    });
    const overlay = new THREE.Mesh(overlayGeom, overlayMat);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(0, (height / 2) + 0.018, 0);
    overlay.renderOrder = (mesh.renderOrder || 1200) + 5;
    overlay.userData = { kind: 'invisibilityOverlay' };
    overlay.onBeforeRender = () => {
      if (overlay.material?.uniforms?.uTime) {
        overlay.material.uniforms.uTime.value = performance.now() / 1000;
      }
    };
    mesh.add(overlay);

    ACTIVE_OVERLAYS.set(mesh, { originals, overlay, uniforms });
  } catch {}
}

export function removeInvisibilityEffect(mesh) {
  try {
    if (!mesh) return;
    const stored = ACTIVE_OVERLAYS.get(mesh);
    if (!stored) return;
    for (const entry of stored.originals || []) {
      if (!entry || !entry.mat) continue;
      entry.mat.transparent = entry.transparent;
      if (typeof entry.opacity === 'number') entry.mat.opacity = entry.opacity;
      entry.mat.depthWrite = entry.depthWrite;
    }
    if (stored.overlay) {
      try { mesh.remove(stored.overlay); } catch {}
      try { stored.overlay.geometry?.dispose(); } catch {}
      try { stored.overlay.material?.dispose(); } catch {}
    }
    ACTIVE_OVERLAYS.delete(mesh);
  } catch {}
}

export function clearInvisibilityEffect(mesh) {
  removeInvisibilityEffect(mesh);
}

export default {
  applyInvisibilityEffect,
  removeInvisibilityEffect,
  clearInvisibilityEffect,
};
