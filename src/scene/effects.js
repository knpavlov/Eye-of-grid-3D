// Centralized scene effects: damage popups, shakes, dissolves
import { getCtx } from './context.js';

// Internal queue for delayed HP popups
const PENDING_HP_POPUPS = [];

function cleanupPopup(entry) {
  try { clearTimeout(entry.timerId); } catch {}
  entry.canceled = true;
}

export function cancelPendingHpPopup(key, delta) {
  if (!PENDING_HP_POPUPS.length) return;
  for (const item of PENDING_HP_POPUPS) {
    if (!item.canceled && item.key === key && item.delta === delta) {
      cleanupPopup(item);
    }
  }
  // keep only active entries
  for (let i = PENDING_HP_POPUPS.length - 1; i >= 0; i--) {
    if (PENDING_HP_POPUPS[i].canceled) PENDING_HP_POPUPS.splice(i, 1);
  }
}

export function scheduleHpPopup(r, c, delta, delayMs) {
  const key = `${r},${c}`;
  const timerId = setTimeout(() => {
    try {
      const { unitMeshes } = getCtx();
      const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
      if (tMesh) {
        const color = delta > 0 ? '#22c55e' : '#ef4444';
        spawnDamageText(tMesh, `${delta > 0 ? '+' : ''}${delta}`, color);
      }
    } catch {}
  }, Math.max(0, delayMs));
  PENDING_HP_POPUPS.push({ key, delta, timerId, canceled: false });
}

export function spawnDamageText(targetMesh, text, color = '#ff5555') {
  const { THREE, renderer, effectsGroup } = getCtx();
  if (!THREE || !renderer || !effectsGroup || !targetMesh) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 64px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  try { tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch {}
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.6, 1.4, 1);
  const pos = targetMesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  sprite.position.copy(pos);
  sprite.renderOrder = 999;
  try { effectsGroup.add(sprite); } catch {}
  const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: () => { effectsGroup.remove(sprite); tex.dispose(); mat.dispose(); } }) : null;
  if (tl) {
    tl.to(sprite.material, { opacity: 1, duration: 0.05 })
      .to(sprite.position, { y: sprite.position.y + 0.8, duration: 0.5, ease: 'power1.out' })
      .to({}, { duration: 1.0 })
      .to(sprite.position, { y: sprite.position.y + 1.6, duration: 0.5, ease: 'power1.in' }, 'end')
      .to(sprite.material, { opacity: 0, duration: 0.5 }, 'end');
  } else {
    // Fallback: immediate cleanup
    effectsGroup.remove(sprite); tex.dispose(); mat.dispose();
  }
}

export function shakeMesh(mesh, times = 3, duration = 0.1) {
  const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.() : null;
  if (!tl || !mesh) return tl;
  const ox = mesh.position.x; const oz = mesh.position.z;
  for (let i = 0; i < times; i++) {
    const dx = (Math.random() * 0.2 - 0.1);
    const dz = (Math.random() * 0.2 - 0.1);
    tl.to(mesh.position, { x: ox + dx, z: oz + dz, duration: duration / 2 })
      .to(mesh.position, { x: ox, z: oz, duration: duration / 2 });
  }
  return tl;
}

function createDissolveMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:       { value: 0.0 },
      uThreshold:  { value: 0.0 },
      uEdgeWidth:  { value: 0.08 },
      uEdgeColor:  { value: new THREE.Color(0.55, 0.80, 1.0) },
      uBaseColor:  { value: new THREE.Color(0.90, 0.95, 1.0) },
      uNoiseScale: { value: 3.0 },
      uNoiseMove:  { value: new THREE.Vector2(0.15, -0.1) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vPos;
      uniform float uTime;
      uniform float uThreshold;
      uniform float uEdgeWidth;
      uniform vec3  uEdgeColor;
      uniform vec3  uBaseColor;
      uniform float uNoiseScale;
      uniform vec2  uNoiseMove;
      float hash(vec2 p){
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm(vec2 p){
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++){
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }
      void main(){
        float heightBias = clamp((vPos.y + 0.9) * 0.2, 0.0, 1.0);
        vec2  uv = vUv * uNoiseScale + uNoiseMove * uTime;
        float n = fbm(uv) * 0.8 + heightBias * 0.2;
        float d = n - uThreshold;
        if (d < 0.0) discard;
        float edge = smoothstep(0.0, uEdgeWidth, d) - smoothstep(uEdgeWidth, uEdgeWidth * 2.0, d);
        vec3 color = mix(uBaseColor, uEdgeColor, edge);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

export function dissolveAndAsh(mesh, awayVec, durationSec = 1.0) {
  const { THREE, effectsGroup, scene } = getCtx();
  if (!mesh || !THREE) return;
  try { mesh.updateWorldMatrix(true, true); } catch {}
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  try { mesh.getWorldPosition(worldPos); mesh.getWorldQuaternion(worldQuat); mesh.getWorldScale(worldScale); } catch {}
  const ghost = mesh.clone(true);
  ghost.traverse(obj => { if (obj && obj.userData) obj.userData = { ...obj.userData }; });
  ghost.position.copy(worldPos);
  ghost.quaternion.copy(worldQuat);
  ghost.scale.copy(worldScale);
  ghost.renderOrder = (mesh.renderOrder || 1000) + 10;
  try { effectsGroup.add(ghost); } catch { (mesh.parent || scene).add(ghost); }
  try { mesh.visible = false; } catch {}

  const dissolveTargets = [];
  ghost.traverse(obj => {
    if (obj && obj.isMesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const newMats = [];
      for (const m of materials) {
        if (!m) { newMats.push(m); continue; }
        const matClone = m.clone();
        matClone.transparent = true;
        matClone.depthWrite = false;
        matClone.onBeforeCompile = (shader) => {
          matClone.userData.shader = shader;
        };
        newMats.push(matClone);
        dissolveTargets.push(matClone);
      }
      obj.material = newMats.length === 1 ? newMats[0] : newMats;
    }
  });

  const mat = createDissolveMaterial(THREE);
  dissolveTargets.forEach(m => m.userData.shader = mat);

  const dir = awayVec ? awayVec.clone() : new THREE.Vector3(0, 0, 0.6);
  const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: () => {
    try { effectsGroup.remove(ghost); } catch {}
    try { mesh.parent?.remove(mesh); } catch {}
  } }) : null;
  if (tl) {
    tl.to(mat.uniforms.uThreshold, { value: 1.0, duration: durationSec, ease: 'power1.in' })
      .to(ghost.position, { x: ghost.position.x + dir.x, y: ghost.position.y + dir.y, z: ghost.position.z + dir.z, duration: durationSec, ease: 'power1.in' }, 0);
  }
}
