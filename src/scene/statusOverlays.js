// Визуальные индикаторы состояний юнитов (пока только владение)
import { getCtx } from './context.js';

function createPossessionOverlay(THREE) {
  const width = 4.9;
  const height = 5.7;
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      colorA: { value: new THREE.Color(0x7c3aed) },
      colorB: { value: new THREE.Color(0xc084fc) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;\nuniform float time;\nuniform vec3 colorA;\nuniform vec3 colorB;\nfloat ripple(vec2 uv, float freq, float speed) {\n  float dist = distance(uv, vec2(0.5));\n  return 0.5 + 0.5 * sin(dist * freq - time * speed);\n}\nvoid main() {\n  float r1 = ripple(vUv, 18.0, 2.4);\n  float r2 = ripple(vUv + vec2(0.12, -0.08), 26.0, 1.6);\n  float mixVal = clamp((r1 + r2) * 0.5, 0.0, 1.0);\n  vec3 col = mix(colorA, colorB, mixVal);\n  float edge = smoothstep(0.48, 0.28, distance(vUv, vec2(0.5)));\n  float alpha = mixVal * edge * 0.6;\n  if (alpha < 0.03) discard;\n  gl_FragColor = vec4(col, alpha);\n}`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.08, 0);
  mesh.renderOrder = 1800;
  const start = performance.now();
  mesh.onBeforeRender = () => {
    const elapsed = (performance.now() - start) / 1000;
    material.uniforms.time.value = elapsed;
  };
  mesh.userData.kind = 'possessionOverlay';
  return mesh;
}

function removeOverlay(mesh, overlay) {
  if (!mesh || !overlay) return;
  try { mesh.remove(overlay); } catch {}
  if (overlay.material) overlay.material.dispose?.();
  if (overlay.geometry) overlay.geometry.dispose?.();
}

export function applyStatusOverlays(unitMesh, unitData) {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE || !unitMesh) return;

  const overlayKey = '__possessionOverlay';
  const hasPossession = !!unitData?.possession;
  const existing = unitMesh.userData[overlayKey];

  if (hasPossession) {
    if (!existing) {
      const overlay = createPossessionOverlay(THREE);
      unitMesh.add(overlay);
      unitMesh.userData[overlayKey] = overlay;
    }
  } else if (existing) {
    removeOverlay(unitMesh, existing);
    unitMesh.userData[overlayKey] = null;
  }
}

export function disposeStatusOverlays(unitMesh) {
  if (!unitMesh) return;
  const overlayKey = '__possessionOverlay';
  const existing = unitMesh.userData?.[overlayKey];
  if (existing) {
    removeOverlay(unitMesh, existing);
    unitMesh.userData[overlayKey] = null;
  }
}
