// Визуальный эффект "поглощения" для отмеченных существ
// Логика эффекта отделена от игровой логики, чтобы можно было переиспользовать в других движках
import { getCtx } from './context.js';

// Константы позволяют быстро подстраивать размер и непрозрачность эффекта при повторном использовании
const BASE_RADIUS = 1.25;
const RADIUS_MULTIPLIER = 1.5; // Увеличиваем радиус на 50%
const BASE_OPACITY = 0.35;
const OPACITY_MULTIPLIER = 1.3; // Делаем эффект на 30% менее прозрачным

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available for possession overlay');
  return THREE;
}

function createOverlayMesh() {
  const THREE = getTHREE();
  const geometry = new THREE.CircleGeometry(BASE_RADIUS * RADIUS_MULTIPLIER, 48);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x8b5cf6) },
      uOpacity: { value: BASE_OPACITY * OPACITY_MULTIPLIER },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered);
        float ripple = sin((dist * 16.0) - uTime * 4.0);
        float falloff = smoothstep(0.6, 0.0, dist);
        float alpha = uOpacity * (0.65 + 0.35 * ripple) * falloff;
        if (alpha <= 0.01) discard;
        vec3 color = uColor * (0.55 + 0.45 * ripple);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    blending: (getTHREE().AdditiveBlending || getTHREE().NormalBlending),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.06, 0);
  mesh.renderOrder = 50;
  mesh.onBeforeRender = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    material.uniforms.uTime.value = now / 1000;
  };
  mesh.userData.__possessionMaterial = material;
  mesh.userData.__possessionGeometry = geometry;
  return mesh;
}

export function attachPossessionOverlay(unitMesh) {
  if (!unitMesh) return null;
  if (unitMesh.userData && unitMesh.userData.possessionOverlay) {
    return unitMesh.userData.possessionOverlay;
  }
  const overlay = createOverlayMesh();
  try { unitMesh.add(overlay); } catch {}
  if (!unitMesh.userData) unitMesh.userData = {};
  unitMesh.userData.possessionOverlay = overlay;
  return overlay;
}

export function disposePossessionOverlay(unitMesh) {
  const overlay = unitMesh?.userData?.possessionOverlay;
  if (!overlay) return;
  try { unitMesh.remove(overlay); } catch {}
  const material = overlay.userData?.__possessionMaterial || overlay.material;
  const geometry = overlay.userData?.__possessionGeometry || overlay.geometry;
  try { material.dispose(); } catch {}
  try { geometry.dispose(); } catch {}
  delete unitMesh.userData.possessionOverlay;
}

try {
  if (typeof window !== 'undefined') {
    window.__scene = window.__scene || {};
    window.__scene.possessionOverlay = { attachPossessionOverlay, disposePossessionOverlay };
  }
} catch {}
