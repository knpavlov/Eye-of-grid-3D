// Эффект наложения для "одержимых" существ.
// Отдельный модуль отвечает за визуализацию, чтобы его можно было переиспользовать.
import { getCtx } from '../context.js';

const overlayByMesh = new WeakMap();
const animatedOverlays = new Set();
let rafId = 0;
let startTime = 0;

function getTHREE() {
  const ctx = getCtx();
  return ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
}

function ensureTicker() {
  if (animatedOverlays.size === 0) {
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    return;
  }
  if (rafId) return;
  startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const loop = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = (now - startTime) / 1000;
    animatedOverlays.forEach(mesh => {
      try {
        const uniforms = mesh.material?.uniforms;
        if (uniforms && uniforms.uTime) uniforms.uTime.value = t;
      } catch {}
    });
    rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(loop)
      : setTimeout(loop, 16);
  };
  rafId = (typeof requestAnimationFrame !== 'undefined')
    ? requestAnimationFrame(loop)
    : setTimeout(loop, 16);
}

function createOverlayMesh(THREE) {
  const geom = new THREE.PlaneGeometry(4.4, 5.0, 1, 1);
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x8b5cf6) },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    blending: THREE.AdditiveBlending,
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
      float ripple(vec2 uv, float shift) {
        float dist = length(uv);
        float wave = sin((dist * 12.0) - uTime * 2.6 + shift);
        float envelope = smoothstep(0.75, 0.0, dist);
        return envelope * (0.5 + 0.5 * wave);
      }
      void main() {
        vec2 uv = (vUv - 0.5) * 2.2;
        float r1 = ripple(uv, 0.0);
        float r2 = ripple(uv, 2.4);
        float alpha = clamp(r1 + r2, 0.0, 1.0) * 0.55;
        vec3 baseColor = mix(vec3(0.15, 0.0, 0.28), uColor, 0.85);
        gl_FragColor = vec4(baseColor, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.09, 0);
  mesh.renderOrder = 5000;
  mesh.userData.kind = 'possessionOverlay';
  animatedOverlays.add(mesh);
  ensureTicker();
  return mesh;
}

export function attachPossessionOverlay(unitMesh) {
  const THREE = getTHREE();
  if (!THREE || !unitMesh) return null;
  if (overlayByMesh.has(unitMesh)) return overlayByMesh.get(unitMesh);
  const overlay = createOverlayMesh(THREE);
  try {
    overlay.renderOrder = (unitMesh.renderOrder || 1200) + 5;
    unitMesh.add(overlay);
  } catch {}
  overlayByMesh.set(unitMesh, overlay);
  return overlay;
}

export function removePossessionOverlay(unitMesh) {
  const overlay = overlayByMesh.get(unitMesh);
  if (!overlay) return;
  overlayByMesh.delete(unitMesh);
  try { animatedOverlays.delete(overlay); } catch {}
  ensureTicker();
  try { if (overlay.parent) overlay.parent.remove(overlay); } catch {}
  try { overlay.geometry?.dispose(); } catch {}
  try { overlay.material?.dispose(); } catch {}
}

export function clearAllPossessionOverlays() {
  Array.from(overlayByMesh.keys()).forEach(mesh => removePossessionOverlay(mesh));
}

export default {
  attachPossessionOverlay,
  removePossessionOverlay,
  clearAllPossessionOverlays,
};
