// Scene effects: damage text popups, mesh shakes and dissolve animations
import { getCtx } from './context.js';

const PENDING_HP_POPUPS = [];

export function cancelPendingHpPopup(key, delta) {
  try {
    if (!PENDING_HP_POPUPS.length) return;
    for (const item of PENDING_HP_POPUPS) {
      if (!item.canceled && item.key === key && item.delta === delta) {
        try { clearTimeout(item.timerId); } catch {}
        item.canceled = true;
      }
    }
    for (let i = PENDING_HP_POPUPS.length - 1; i >= 0; i--) {
      if (PENDING_HP_POPUPS[i].canceled) PENDING_HP_POPUPS.splice(i, 1);
    }
  } catch {}
}

export function scheduleHpPopup(r, c, delta, delayMs) {
  try {
    const key = `${r},${c}`;
    const timerId = setTimeout(() => {
      try {
        const ctx = getCtx();
        const unitMeshes = ctx.unitMeshes || (typeof window !== 'undefined' ? window.unitMeshes : []);
        const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
        if (tMesh) {
          const color = delta > 0 ? '#22c55e' : '#ef4444';
          spawnDamageText(tMesh, `${delta > 0 ? '+' : ''}${delta}`, color);
        }
      } catch {}
    }, Math.max(0, delayMs));
    PENDING_HP_POPUPS.push({ key, delta, timerId, scheduledAt: Date.now() + Math.max(0, delayMs), canceled: false });
  } catch {}
}

export function spawnDamageText(targetMesh, text, color = '#ff5555') {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : null);
  const renderer = ctx.renderer;
  const effectsGroup = ctx.effectsGroup;
  if (!THREE || !renderer || !effectsGroup || !targetMesh) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.font = 'bold 64px Arial';
    c.fillStyle = color;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 6;
    c.strokeText(text, canvas.width / 2, canvas.height / 2);
    c.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 1.4, 1);
    const pos = targetMesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    sprite.position.copy(pos);
    sprite.renderOrder = 999;
    effectsGroup.add(sprite);
    const tl = (typeof window !== 'undefined' && window.gsap) ? window.gsap.timeline({ onComplete: () => { effectsGroup.remove(sprite); tex.dispose(); mat.dispose(); } }) : null;
    if (tl) {
      tl.to(sprite.material, { opacity: 1, duration: 0.05 })
        .to(sprite.position, { y: sprite.position.y + 0.8, duration: 0.5, ease: 'power1.out' })
        .to({}, { duration: 1.0 })
        .to(sprite.position, { y: sprite.position.y + 1.6, duration: 0.5, ease: 'power1.in' }, 'end')
        .to(sprite.material, { opacity: 0, duration: 0.5 }, 'end');
    }
  } catch {}
}

export function shakeMesh(mesh, times = 3, duration = 0.1) {
  const tl = (typeof window !== 'undefined' && window.gsap) ? window.gsap.timeline() : null;
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

function createDissolveMaterial() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : null);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0.0 },
      uThreshold: { value: 0.0 },
      uEdgeWidth: { value: 0.08 },
      uEdgeColor: { value: new THREE.Color(0.55, 0.80, 1.0) },
      uBaseColor: { value: new THREE.Color(0.90, 0.95, 1.0) },
      uNoiseScale: { value: 3.0 },
      uNoiseMove: { value: new THREE.Vector2(0.15, -0.1) },
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
    `,
  });
}

export function dissolveAndAsh(mesh, awayVec, durationSec = 1.0) {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : null);
  const effectsGroup = ctx.effectsGroup || (ctx.scene);
  const scene = ctx.scene;
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
          shader.uniforms.uTime = { value: 0.0 };
          shader.uniforms.uThreshold = { value: 0.0 };
          shader.uniforms.uEdgeWidth = { value: 0.12 };
          shader.uniforms.uEdgeColor = { value: new THREE.Color(0.55, 0.80, 1.0) };
          shader.uniforms.uBaseColor = { value: new THREE.Color(0.90, 0.95, 1.0) };
          shader.uniforms.uNoiseScale = { value: 3.0 };
          shader.uniforms.uNoiseMove = { value: new THREE.Vector2(0.15, -0.1) };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n varying vec3 dWorldPos;')
            .replace('#include <project_vertex>', '#include <project_vertex>\n dWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
          const header = `
            varying vec3 dWorldPos;
            uniform float uTime; uniform float uThreshold; uniform float uEdgeWidth; uniform vec3 uEdgeColor; uniform float uNoiseScale; uniform vec2 uNoiseMove;
            float dhash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
            float dnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float a = dhash(i); float b = dhash(i+vec2(1.0,0.0)); float c = dhash(i+vec2(0.0,1.0)); float d = dhash(i+vec2(1.0,1.0)); vec2 u = f*f*(3.0-2.0*f); return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
            float dfbm(vec2 p){ float v=0.0; float a=0.5; for (int i=0;i<5;i++){ v+=a*dnoise(p); p*=2.02; a*=0.5; } return v; }
            vec4 applyDissolve(vec4 baseColor){
              vec2  uv = dWorldPos.xz * uNoiseScale + uNoiseMove * uTime;
              float heightBias = clamp((dWorldPos.y) * 0.15, 0.0, 1.0);
              float n = dfbm(uv) * 0.8 + heightBias * 0.2;
              float d = n - uThreshold; if (d < 0.0) discard;
              float edge = smoothstep(0.0, uEdgeWidth, d) - smoothstep(uEdgeWidth, uEdgeWidth*2.0, d);
              vec3 c = mix(baseColor.rgb, uEdgeColor, edge);
              return vec4(c, baseColor.a);
            }
          `;
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + header);
          try {
            shader.fragmentShader = shader.fragmentShader.replace(/gl_FragColor\s*=\s*([^;]+);/g, 'gl_FragColor = applyDissolve($1);');
          } catch {}
          shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor = applyDissolve(gl_FragColor);');
          dissolveTargets.push(shader.uniforms);
        };
        matClone.needsUpdate = true;
        newMats.push(matClone);
      }
      obj.material = Array.isArray(obj.material) ? newMats : newMats[0];
    }
  });

  const start = performance.now();
  let rafId = 0; let alive = true;
  (function tick(){
    if (!alive) return;
    const t = (performance.now() - start) / 1000;
    for (const u of dissolveTargets) { if (u && u.uTime) u.uTime.value = t; }
    rafId = requestAnimationFrame(tick);
  })();
  const tl = (typeof window !== 'undefined' && window.gsap) ? window.gsap.timeline({ onComplete: () => {
    alive = false; try { cancelAnimationFrame(rafId); } catch {}
    try { effectsGroup.remove(ghost); } catch {}
  } }) : null;
  const dy = 1.2;
  if (tl) {
    tl.to({}, { duration: 0.0 })
      .to({ th: 0.0 }, {
        th: 1.0, duration: Math.max(0.6, durationSec), ease: 'power1.inOut',
        onUpdate: function(){ const v = this.targets()[0].th; for (const u of dissolveTargets) { if (u && u.uThreshold) u.uThreshold.value = v; } },
      }, 0)
      .to(ghost.position, { y: ghost.position.y + dy, duration: Math.max(0.6, durationSec), ease: 'power1.inOut' }, 0);
  }
}

const api = { spawnDamageText, shakeMesh, cancelPendingHpPopup, scheduleHpPopup, dissolveAndAsh };
try {
  if (typeof window !== 'undefined') {
    window.__fx = api;
  }
} catch {}

export default api;
