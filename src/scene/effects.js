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

// Визуализировать различия между предыдущим и новым состоянием доски
// Используется наблюдателем/оппонентом для показа урона и появления/исчезновения юнитов
export function playDeltaAnimations(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;

    const gameState = typeof window !== 'undefined' ? window.gameState : null;
    const isActivePlayer = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number' && gameState && typeof gameState.active === 'number' && window.MY_SEAT === gameState.active);

    const prevB = prevState.board || [];
    const nextB = nextState.board || [];

    const ctx = window.__scene?.getCtx?.() || {};
    const tileMeshes = ctx.tileMeshes || [];
    const unitMeshes = ctx.unitMeshes || [];
    const effectsGroup = ctx.effectsGroup || window.effectsGroup;
    const cardGroup = ctx.cardGroup || window.cardGroup;
    const THREE = window.THREE;
    const gsap = window.gsap;
    const createCard3D = window.__cards?.createCard3D;
    const animateManaGainFromWorld = window.__ui?.mana?.animateManaGainFromWorld || window.animateManaGainFromWorld;

    // Появление/исчезновение юнитов
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && !nu) {
          try {
            const tile = tileMeshes?.[r]?.[c]; if (!tile) continue;
            const ghost = createCard3D ? createCard3D(window.CARDS[pu.tplId], false) : null;
            if (ghost && THREE) {
              ghost.position.copy(tile.position).add(new THREE.Vector3(0, 0.28, 0));
              try { effectsGroup.add(ghost); } catch { cardGroup?.add(ghost); }
              window.__fx?.dissolveAndAsh(ghost, new THREE.Vector3(0,0,0.6), 0.9);
            }
            const p = tile.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            animateManaGainFromWorld?.(p, pu.owner, true);
            try {
              if (!window.NET_ACTIVE && gameState?.players && typeof pu.owner === 'number') {
                gameState.players[pu.owner].mana = (window.capMana ? window.capMana((gameState.players[pu.owner].mana||0) + 1) : (gameState.players[pu.owner].mana||0)+1);
                window.updateUI?.();
              }
            } catch {}
          } catch {}
        } else if (!pu && nu) {
          try {
            const tMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
            if (tMesh && gsap) {
              const s = tMesh.scale.clone();
              tMesh.scale.set(s.x * 0.7, s.y * 0.7, s.z * 0.7);
              gsap.to(tMesh.scale, { x: s.x, y: s.y, z: s.z, duration: 0.28, ease: 'power2.out' });
            }
          } catch {}
        }
      }
    }

    if (isActivePlayer) return;

    const hpChanges = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pu = (prevB[r] && prevB[r][c] && prevB[r][c].unit) ? prevB[r][c].unit : null;
        const nu = (nextB[r] && nextB[r][c] && nextB[r][c].unit) ? nextB[r][c].unit : null;
        if (pu && nu) {
          const pHP = (typeof pu.currentHP === 'number') ? pu.currentHP : pu.hp;
          const nHP = (typeof nu.currentHP === 'number') ? nu.currentHP : nu.hp;
          const delta = (typeof pHP === 'number' && typeof nHP === 'number') ? (nHP - pHP) : 0;
          if (delta !== 0) hpChanges.push({ r, c, delta });
        }
      }
    }

    const __now = Date.now();
    const pendingHpChanges = (window.RECENT_REMOTE_DAMAGE && window.RECENT_REMOTE_DAMAGE.size)
      ? hpChanges.filter(change => {
          try {
            const key = `${change.r},${change.c}`;
            const rec = window.RECENT_REMOTE_DAMAGE.get(key);
            return !(rec && rec.delta === change.delta && (__now - rec.ts) < 2000);
          } catch { return true; }
        })
      : hpChanges;

    const halfCount = Math.ceil(pendingHpChanges.length / 2);
    for (let i = 0; i < halfCount && i < pendingHpChanges.length; i++) {
      const change = pendingHpChanges[i];
      scheduleHpPopup(change.r, change.c, change.delta, 800);
    }
    if (pendingHpChanges.length > halfCount) {
      for (let i = halfCount; i < pendingHpChanges.length; i++) {
        const change = pendingHpChanges[i];
        scheduleHpPopup(change.r, change.c, change.delta, 1600);
      }
    }
  } catch {}
}

export function spawnDamageText(targetMesh, text, color = '#ff5555') {
  if (!targetMesh || typeof window === 'undefined') return;
  const THREE = window.THREE; const gsap = window.gsap;
  const renderer = window.renderer || window.__scene?.getCtx()?.renderer;
  const effectsGroup = window.effectsGroup || window.__scene?.getCtx()?.effectsGroup;
  if (!THREE || !gsap || !renderer || !effectsGroup) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font = 'bold 64px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
  ctx.strokeText(text, canvas.width/2, canvas.height/2);
  ctx.fillText(text, canvas.width/2, canvas.height/2);
  const tex = new THREE.CanvasTexture(canvas);
  try { tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch {}
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.6, 1.4, 1);
  const pos = targetMesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  sprite.position.copy(pos);
  sprite.renderOrder = 999;
  effectsGroup.add(sprite);
  const tl = gsap.timeline({ onComplete: () => { effectsGroup.remove(sprite); tex.dispose(); mat.dispose(); } });
  tl.to(sprite.material, { opacity: 1, duration: 0.05 })
    .to(sprite.position, { y: sprite.position.y + 0.8, duration: 0.5, ease: 'power1.out' })
    .to({}, { duration: 1.0 })
    .to(sprite.position, { y: sprite.position.y + 1.6, duration: 0.5, ease: 'power1.in' }, 'end')
    .to(sprite.material, { opacity: 0, duration: 0.5 }, 'end');
}

export function shakeMesh(mesh, times = 3, duration = 0.1) {
  const gsap = window.gsap; if (!gsap || !mesh) return;
  const tl = gsap.timeline();
  const ox = mesh.position.x; const oz = mesh.position.z;
  for (let i = 0; i < times; i++) {
    const dx = (Math.random()*0.2 - 0.1);
    const dz = (Math.random()*0.2 - 0.1);
    tl.to(mesh.position, { x: ox + dx, z: oz + dz, duration: duration/2 })
      .to(mesh.position, { x: ox, z: oz, duration: duration/2 });
  }
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

const api = { spawnDamageText, shakeMesh, dissolveAndAsh, dissolveTileSwap, dissolveTileCrossfade, scheduleHpPopup, cancelPendingHpPopup, playDeltaAnimations };
try { if (typeof window !== 'undefined') window.__fx = api; } catch {}
export default api;
