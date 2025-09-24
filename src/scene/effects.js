// Shared scene effects: damage popups, shakes, dissolves, and HP popup scheduling
// Relies on global THREE/gsap and scene context; exported for reuse across modules.

let PENDING_HP_POPUPS = [];

export function cancelPendingHpPopup(key, delta) {
  try {
    if (!PENDING_HP_POPUPS.length) return;
    for (const item of PENDING_HP_POPUPS) {
      if (!item.canceled && item.key === key && item.delta === delta) {
        try { clearTimeout(item.timerId); } catch {}
        item.canceled = true;
      }
    }
    PENDING_HP_POPUPS = PENDING_HP_POPUPS.filter(x => !x.canceled);
  } catch {}
}

export function scheduleHpPopup(r, c, delta, delayMs) {
  try {
    const key = `${r},${c}`;
    const timerId = setTimeout(() => {
      try {
        const unitMeshes = window.unitMeshes || [];
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

export function spawnDamageText(targetMesh, text, color = '#ff5555', options = {}) {
  if (!targetMesh || typeof window === 'undefined') return;
  const THREE = window.THREE; const gsap = window.gsap;
  const renderer = window.renderer || window.__scene?.getCtx()?.renderer;
  const effectsGroup = window.effectsGroup || window.__scene?.getCtx()?.effectsGroup;
  if (!THREE || !gsap || !renderer || !effectsGroup) return;

  const {
    fontSize = 64,
    fontFamily = 'Arial',
    fontWeight = 'bold',
    strokeStyle = 'rgba(0,0,0,0.6)',
    lineWidth = 6,
    padding = 24,
    canvasWidth = null,
    canvasHeight = null,
    scale: scaleOpt = null,
    scaleX: explicitScaleX,
    scaleY: explicitScaleY,
    offsetX = 0,
    offsetY = 0.9,
    offsetZ = 0,
    appearDuration = 0.05,
    floatDuration = 0.5,
    firstRise = 0.8,
    secondRise = 1.6,
    holdDuration = 1.0,
    fadeDuration = 0.5,
    easingOut = 'power1.out',
    easingIn = 'power1.in',
  } = options || {};

  const fontSpec = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = fontSpec;
  const textWidth = measureCtx.measureText(text).width;
  const computedWidth = canvasWidth ?? Math.max(256, Math.ceil(textWidth + padding * 2));
  const computedHeight = canvasHeight ?? Math.max(128, Math.ceil(fontSize + padding * 2));

  const canvas = document.createElement('canvas');
  canvas.width = computedWidth;
  canvas.height = computedHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = fontSpec;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  if (strokeStyle && lineWidth > 0) {
    ctx.strokeText(text, centerX, centerY);
  }
  ctx.fillText(text, centerX, centerY);

  const tex = new THREE.CanvasTexture(canvas);
  try { tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch {}
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  const derivedScaleX = explicitScaleX
    ?? (typeof scaleOpt === 'number' ? scaleOpt : scaleOpt?.x)
    ?? 2.6;
  const derivedScaleY = explicitScaleY
    ?? (typeof scaleOpt === 'number' ? scaleOpt : scaleOpt?.y)
    ?? 1.4;
  sprite.scale.set(derivedScaleX, derivedScaleY, 1);

  const offsetVec = new THREE.Vector3(offsetX, offsetY, offsetZ);
  const basePos = targetMesh.position.clone().add(offsetVec);
  sprite.position.copy(basePos);
  sprite.renderOrder = 999;
  effectsGroup.add(sprite);

  const startY = sprite.position.y;
  const firstTargetY = startY + firstRise;
  const finalTargetY = firstTargetY + secondRise;
  const tl = gsap.timeline({
    onComplete: () => {
      try { effectsGroup.remove(sprite); } catch {}
      tex.dispose();
      mat.dispose();
    },
  });
  tl.to(sprite.material, { opacity: 1, duration: appearDuration })
    .to(sprite.position, { y: firstTargetY, duration: floatDuration, ease: easingOut })
    .to({}, { duration: holdDuration })
    .add('fade')
    .to(sprite.position, { y: finalTargetY, duration: fadeDuration, ease: easingIn }, 'fade')
    .to(sprite.material, { opacity: 0, duration: fadeDuration }, 'fade');
}

// Короткий взрывной столб магической энергии
export function magicBurst(pos, durationSec = 0.75) {
  const THREE = window.THREE; const gsap = window.gsap;
  const effectsGroup = window.effectsGroup || window.__scene?.getCtx()?.effectsGroup;
  if (!THREE || !gsap || !effectsGroup || !pos) return;

  // Группа, содержащая все части эффекта
  const group = new THREE.Group();
  group.position.copy(pos);
  effectsGroup.add(group);

  // Светящийся столб увеличенного размера
  const beamGeom = new THREE.CylinderGeometry(0.9, 0.9, 6, 32, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.y = 3.0;
  group.add(beam);
  gsap.to(beam.scale, { x: 2, z: 2, y: 1.2, duration: durationSec / 2, yoyo: true, repeat: 1, ease: 'power2.out' });
  gsap.to(beam.material, { opacity: 0, duration: durationSec });

  // Мощный выброс магических частиц
  const count = 240;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.4;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    positions[i * 3] = px;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = pz;
    velocities.push(new THREE.Vector3(px * 8, Math.random() * 8 + 4, pz * 8));
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.2,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geom, mat);
  group.add(points);

  // Разлетающиеся клочья земли
  const debrisCount = 50;
  const debrisGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x665544,
    transparent: true,
    opacity: 1.0,
    roughness: 0.9,
    metalness: 0.1,
  });
  const debrisPieces = [];
  const debrisVels = [];
  for (let i = 0; i < debrisCount; i++) {
    const piece = new THREE.Mesh(debrisGeom, debrisMat);
    piece.position.set(0, 0, 0);
    group.add(piece);
    debrisPieces.push(piece);
    const ang = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 4;
    debrisVels.push(new THREE.Vector3(Math.cos(ang) * speed, Math.random() * 4 + 2, Math.sin(ang) * speed));
  }
  gsap.to(debrisMat, { opacity: 0, duration: durationSec });

  const start = performance.now();
  (function tick() {
    const elapsed = (performance.now() - start) / 1000;
    for (let i = 0; i < count; i++) {
      positions[i * 3] += velocities[i].x * 0.016;
      positions[i * 3 + 1] += velocities[i].y * 0.016;
      positions[i * 3 + 2] += velocities[i].z * 0.016;
    }
    for (let i = 0; i < debrisCount; i++) {
      const v = debrisVels[i];
      const p = debrisPieces[i];
      p.position.x += v.x * 0.016;
      p.position.y += v.y * 0.016;
      p.position.z += v.z * 0.016;
      v.y -= 9.8 * 0.016;
      p.rotation.x += 0.1;
      p.rotation.y += 0.1;
    }
    geom.attributes.position.needsUpdate = true;
    if (elapsed < durationSec) requestAnimationFrame(tick);
  })();

  gsap.to(mat, {
    opacity: 0,
    duration: durationSec,
    onComplete: () => {
      try { effectsGroup.remove(group); } catch {}
      geom.dispose(); mat.dispose(); beamGeom.dispose(); beamMat.dispose();
      debrisGeom.dispose(); debrisMat.dispose();
    },
  });
}

export function shakeMesh(mesh, times = 3, duration = 0.1) {
  const gsap = window.gsap; if (!gsap || !mesh) return;
  mesh.userData = mesh.userData || {};
  try {
    const prev = mesh.userData.__shakeTimeline;
    if (prev && typeof prev.kill === 'function') {
      prev.kill();
    }
  } catch {}
  const tl = gsap.timeline({
    onComplete: () => {
      try {
        if (mesh?.userData) mesh.userData.__shakeTimeline = null;
      } catch {}
    },
  });
  const ox = mesh.position.x; const oz = mesh.position.z;
  for (let i = 0; i < times; i++) {
    const dx = (Math.random()*0.2 - 0.1);
    const dz = (Math.random()*0.2 - 0.1);
    tl.to(mesh.position, { x: ox + dx, z: oz + dz, duration: duration/2 })
      .to(mesh.position, { x: ox, z: oz, duration: duration/2 });
  }
  mesh.userData.__shakeTimeline = tl;
  return tl;
}

export function dissolveAndAsh(mesh, awayVec, durationSec = 1.0) {
  const THREE = window.THREE; const gsap = window.gsap;
  const effectsGroup = window.effectsGroup || window.__scene?.getCtx()?.effectsGroup;
  const scene = window.scene || window.__scene?.getCtx()?.scene;
  if (!mesh || !THREE || !gsap || !effectsGroup || !scene) return;
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
  try { effectsGroup.add(ghost); } catch { (mesh.parent||scene).add(ghost); }
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
            uniform float uTime; uniform float uThreshold; uniform float uEdgeWidth; uniform vec3 uEdgeColor; uniform vec3 uBaseColor; uniform float uNoiseScale; uniform vec2 uNoiseMove;
            float dhash(vec2 p){ p = fract(p * vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
            float dnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=dhash(i); float b=dhash(i+vec2(1.,0.)); float c=dhash(i+vec2(0.,1.)); float d=dhash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
            float dfbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<5;i++){ v+=a*dnoise(p); p*=2.02; a*=0.5; } return v; }
            vec4 applyDissolve(vec4 baseColor){ vec2 uv = dWorldPos.xz * uNoiseScale + uNoiseMove * uTime; float heightBias = clamp((dWorldPos.y) * 0.15, 0.0, 1.0); float n = dfbm(uv) * 0.8 + heightBias * 0.2; float d = n - uThreshold; if (d < 0.0) discard; float edge = smoothstep(0.0, uEdgeWidth, d) - smoothstep(uEdgeWidth, uEdgeWidth*2.0, d); vec3 c = mix(baseColor.rgb, uEdgeColor, edge); return vec4(c, baseColor.a); }
          `;
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + header);
          try { shader.fragmentShader = shader.fragmentShader.replace(/gl_FragColor\s*=\s*([^;]+);/g, 'gl_FragColor = applyDissolve($1);'); } catch {}
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
  const tl = gsap.timeline({ onComplete: () => {
    alive = false; try { cancelAnimationFrame(rafId); } catch {}
    try { effectsGroup.remove(ghost); } catch {}
  }});
  const dy = 1.2;
  tl.to({}, { duration: 0.0 })
    .to({ th: 0.0 }, {
      th: 1.0, duration: Math.max(0.6, durationSec), ease: 'power1.inOut',
      onUpdate: function(){ const v = this.targets()[0].th; for (const u of dissolveTargets) { if (u && u.uThreshold) u.uThreshold.value = v; } },
    }, 0)
    .to(ghost.position, { y: ghost.position.y + dy, duration: Math.max(0.6, durationSec), ease: 'power1.inOut' }, 0);
}

export function dissolveTileSwap(tileMesh, newMaterial, durationSec = 0.9) {
  const THREE = window.THREE; const gsap = window.gsap;
  if (!tileMesh || !newMaterial || !THREE || !gsap) return;
  try {
    const old = tileMesh.material;
    const uniforms = {
      uTime: { value: 0.0 },
      uThreshold: { value: 0.0 },
      uEdgeWidth: { value: 0.10 },
      uEdgeColor: { value: new THREE.Color(0.95, 0.85, 0.4) },
      uNoiseScale: { value: 5.0 },
      uNoiseMove: { value: new THREE.Vector2(0.2, -0.12) }
    };
    const matClone = old.clone();
    matClone.transparent = true; matClone.depthWrite = false;
    matClone.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uThreshold = uniforms.uThreshold;
      shader.uniforms.uEdgeWidth = uniforms.uEdgeWidth;
      shader.uniforms.uEdgeColor = uniforms.uEdgeColor;
      shader.uniforms.uNoiseScale = uniforms.uNoiseScale;
      shader.uniforms.uNoiseMove = uniforms.uNoiseMove;
      const header = `
        uniform float uTime; uniform float uThreshold; uniform float uEdgeWidth; uniform vec3 uEdgeColor; uniform float uNoiseScale; uniform vec2 uNoiseMove;
        float hashf(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
        float noisef(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hashf(i); float b=hashf(i+vec2(1.,0.)); float c=hashf(i+vec2(0.,1.)); float d=hashf(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
        float fbmf(vec2 p){ float v=0., a=0.5; for(int i=0;i<5;i++){ v+=a*noisef(p); p*=2.02; a*=0.5; } return v; }
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n'+header);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n{
        vec2 uv = gl_FragCoord.xy * (uNoiseScale/512.0) + uNoiseMove * uTime;
        float n = fbmf(uv);
        float d = n - uThreshold; if (d < 0.0) discard;
        float edge = smoothstep(0.0, uEdgeWidth, d) - smoothstep(uEdgeWidth, uEdgeWidth*2.0, d);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdgeColor, edge);
      }`);
    };
    tileMesh.material = matClone; tileMesh.material.needsUpdate = true;
    const start = performance.now(); let rafId=0, alive=true;
    (function tick(){ if(!alive) return; const t=(performance.now()-start)/1000; uniforms.uTime.value=t; rafId=requestAnimationFrame(tick); })();
    gsap.to({ th: 0.0 }, { th: 1.0, duration: Math.max(0.5, durationSec), ease: 'power1.inOut', onUpdate: function(){ uniforms.uThreshold.value=this.targets()[0].th; }, onComplete: ()=>{
      alive=false; try{ cancelAnimationFrame(rafId);}catch{}
      try { old.dispose && old.dispose(); } catch {}
      tileMesh.material = newMaterial; tileMesh.material.needsUpdate = true;
    }});
  } catch {
    tileMesh.material = newMaterial; tileMesh.material.needsUpdate = true;
  }
}

export function dissolveTileCrossfade(tileMesh, oldMaterial, newMaterial, durationSec = 0.9) {
  const THREE = window.THREE; const gsap = window.gsap; const boardGroup = window.boardGroup || window.__scene?.getCtx()?.boardGroup; const scene = window.scene || window.__scene?.getCtx()?.scene;
  if (!THREE || !gsap) { dissolveTileSwap(tileMesh, newMaterial, durationSec); return; }
  try {
    if (!tileMesh || !oldMaterial || !newMaterial) return dissolveTileSwap(tileMesh, newMaterial, durationSec);
    const geom = tileMesh.geometry;
    const group = new THREE.Group();
    group.position.copy(tileMesh.position);
    group.rotation.copy(tileMesh.rotation);
    group.scale.copy(tileMesh.scale);
    (boardGroup || scene).add(group);
    const oldMesh = new THREE.Mesh(geom.clone(), oldMaterial.clone());
    const newMesh = new THREE.Mesh(geom.clone(), newMaterial.clone());
    group.add(oldMesh); group.add(newMesh);
    oldMesh.material.transparent = true; newMesh.material.transparent = true;
    oldMesh.material.depthWrite = false; newMesh.material.depthWrite = false;
    oldMesh.material.opacity = 1.0; newMesh.material.opacity = 0.0;
    const tl = gsap.timeline({ onComplete: () => {
      try { tileMesh.material = newMaterial; tileMesh.material.needsUpdate = true; } catch {}
      try { (boardGroup || scene).remove(group); } catch {}
    }});
    tl.to(oldMesh.material, { opacity: 0.0, duration: Math.max(0.4, durationSec), ease: 'power1.inOut' }, 0)
      .to(newMesh.material, { opacity: 1.0, duration: Math.max(0.4, durationSec), ease: 'power1.inOut' }, 0);
  } catch {
    dissolveTileSwap(tileMesh, newMaterial, durationSec);
  }
}

const api = { spawnDamageText, magicBurst, shakeMesh, dissolveAndAsh, dissolveTileSwap, dissolveTileCrossfade, scheduleHpPopup, cancelPendingHpPopup };
try { if (typeof window !== 'undefined') window.__fx = api; } catch {}
export default api;
