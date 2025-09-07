// Hand rendering and card draw animations
import { getCtx } from './context.js';
import { createCard3D } from './cards.js';
import { DRAW_CARD_TUNE } from '../config/drawCardTune.js';

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

function computeHandTransform(index, total) {
  const THREE = getTHREE();
  const handSize = Math.max(1, total);
  const angleSpread = Math.min(0.3, 1.2 / (handSize + 1));
  const radius = 8.0;
  const baseY = 6.0;
  const angle = (index - (handSize - 1) / 2) * angleSpread;
  const x = Math.sin(angle) * radius;
  const z = radius + Math.cos(angle) * radius * 0.3 - ((typeof window !== 'undefined' && window.HAND_Z_OFFSET) || 1.0);
  const y = baseY + Math.sin(angle) * 1.5;
  const rot = new THREE.Euler(-0.2 + angle * 0.1, angle * 0.5, 0);
  const pos = new THREE.Vector3(x, y, z);
  const scale = new THREE.Vector3(0.54, 1, 0.54);
  return { position: pos, rotation: rot, scale };
}

export function setHandCardHoverVisual(mesh, hovered) {
  if (!mesh) return;
  const ctx = getCtx();
  const { camera } = ctx;
  const THREE = getTHREE();

  const materials = [];
  const collect = (obj) => {
    if (!obj) return;
    if (obj.material) {
      if (Array.isArray(obj.material)) materials.push(...obj.material);
      else materials.push(obj.material);
    }
    (obj.children || []).forEach(collect);
  };
  collect(mesh);

  if (hovered) {
    mesh.renderOrder = 10000;
    materials.forEach(m => { if (m) { m.depthTest = true; m.depthWrite = true; m.needsUpdate = true; } });
    try {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const towardCamera = camDir.clone().multiplyScalar(-0.7);
      const target = mesh.userData.originalPosition.clone().add(new THREE.Vector3(0, 0.9, 0)).add(towardCamera);
      gsap.to(mesh.position, { x: target.x, y: target.y, z: target.z, duration: 0.18 });
    } catch {}
    try { (mesh.children || []).forEach(ch => { if (ch && ch.userData && ch.userData.kind === 'illustrationPlane') { ch.renderOrder = mesh.renderOrder + 1; } }); } catch {}
  } else {
    mesh.renderOrder = 2000;
    materials.forEach(m => { if (m) { m.depthTest = true; m.depthWrite = true; m.needsUpdate = true; } });
    try {
      const p = mesh.userData.originalPosition;
      gsap.to(mesh.position, { x: p.x, y: p.y, z: p.z, duration: 0.18 });
    } catch {}
    try { (mesh.children || []).forEach(ch => { if (ch && ch.userData && ch.userData.kind === 'illustrationPlane') { ch.renderOrder = mesh.renderOrder + 1; } }); } catch {}
  }
}

export function updateHand(gameState) {
  const ctx = getCtx();
  const { cardGroup } = ctx;
  const drawAnimationActive = (typeof window !== 'undefined' ? window.drawAnimationActive : false);

  // During draw animation we skip hand rebuild to preserve pre-layout
  if (drawAnimationActive) return ctx.handCardMeshes;

  try { (ctx.handCardMeshes || []).forEach(card => { if (card && card.parent) card.parent.remove(card); }); } catch {}
  ctx.handCardMeshes = [];

  if (!gameState) return ctx.handCardMeshes;

  const viewerSeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : gameState.active;
  let hand = (gameState.players && gameState.players[viewerSeat] && gameState.players[viewerSeat].hand)
    ? gameState.players[viewerSeat].hand.slice()
    : [];

  try {
    if (viewerSeat === (typeof window !== 'undefined' ? window.MY_SEAT : viewerSeat) && (typeof window !== 'undefined' && window.pendingDrawCount > 0)) {
      hand = hand.slice(0, Math.max(0, hand.length - window.pendingDrawCount));
    }
  } catch {}

  const indices = [];
  for (let i = 0; i < hand.length; i++) {
    if (viewerSeat === gameState.active && typeof window !== 'undefined' && typeof window.pendingRitualSpellHandIndex === 'number' && i === window.pendingRitualSpellHandIndex) continue;
    if (typeof window !== 'undefined' && Array.isArray(window.PENDING_HIDE_HAND_CARDS) && window.PENDING_HIDE_HAND_CARDS.includes(i)) continue;
    indices.push(i);
  }
  const handSize = indices.length;
  if (handSize === 0) return ctx.handCardMeshes;

  for (let k = 0; k < handSize; k++) {
    const i = indices[k];
    const cardData = hand[i];
    const card = createCard3D(cardData, true);
    const t = computeHandTransform(k, handSize);
    card.position.copy(t.position);
    card.rotation.copy(t.rotation);
    card.userData.originalPosition = t.position.clone();
    card.userData.originalRotation = t.rotation.clone();
    card.userData.handIndex = i;
    card.userData.cardData = cardData;
    card.renderOrder = 2000;
    cardGroup.add(card);
    ctx.handCardMeshes.push(card);
  }

  return ctx.handCardMeshes;
}

export async function animateDrawnCardToHand(cardTpl) {
  if (!cardTpl) return;
  const ctx = getCtx();
  const THREE = getTHREE();
  const { cardGroup, camera } = ctx;

  if (typeof window !== 'undefined') window.drawAnimationActive = true;
  try { if (typeof window !== 'undefined' && window.refreshInputLockUI) window.refreshInputLockUI(); } catch {}

  const big = createCard3D(cardTpl, false);
  const T = DRAW_CARD_TUNE;
  big.position.set(0, (T.posY ?? 10.0), (T.posZ ?? 2.4));

  try {
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    const faceNormal = camForward.clone().negate().normalize();
    const camUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    let right = new THREE.Vector3().crossVectors(camUpWorld, faceNormal);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
    const upInPlane = new THREE.Vector3().crossVectors(faceNormal, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, faceNormal, upInPlane);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    big.setRotationFromQuaternion(q);
  } catch {
    big.rotation.set(0, 0, 0);
  }

  big.scale.set((T.scale ?? 1.7), (T.scale ?? 1.7), (T.scale ?? 1.7));
  big.renderOrder = 9000;

  const allMaterials = [];
  const collectMaterials = (obj) => {
    if (!obj) return;
    if (obj.material) {
      if (Array.isArray(obj.material)) allMaterials.push(...obj.material);
      else allMaterials.push(obj.material);
    }
    (obj.children || []).forEach(collectMaterials);
  };
  collectMaterials(big);
  allMaterials.forEach(m => { if (m) { m.transparent = true; m.opacity = 0; } });
  cardGroup.add(big);

  const totalVisible = Math.max(0, (ctx.handCardMeshes || []).filter(m => m?.userData?.isInHand).length);
  const totalAfter = totalVisible + 1;
  const indexAfter = totalAfter - 1;
  const target = computeHandTransform(indexAfter, totalAfter);

  try {
    const preLayoutDuration = 0.6;
    for (let i = 0; i < ctx.handCardMeshes.length; i++) {
      const mesh = ctx.handCardMeshes[i];
      if (!mesh || !mesh.userData || !mesh.userData.isInHand) continue;
      const t = computeHandTransform(i, totalAfter);
      gsap.to(mesh.position, {
        x: t.position.x,
        y: t.position.y,
        z: t.position.z,
        duration: preLayoutDuration,
        ease: 'power2.inOut'
      });
      gsap.to(mesh.rotation, {
        x: t.rotation.x,
        y: t.rotation.y,
        z: t.rotation.z,
        duration: preLayoutDuration,
        ease: 'power2.inOut'
      });
      gsap.to(mesh.scale, { x: 0.54, y: 1, z: 0.54, duration: 0.18 });
      try { mesh.userData.originalPosition.copy(t.position); } catch {}
      try { mesh.userData.originalRotation.copy(t.rotation); } catch {}
    }
  } catch {}

  await new Promise(resolve => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to(allMaterials, { opacity: 1, duration: 0.8, ease: 'power2.out' })
      .to(big.position, { x: target.position.x, y: target.position.y, z: target.position.z, duration: 0.7, ease: 'power2.inOut' }, 'fly')
      .to(big.rotation, { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z, duration: 0.7, ease: 'power2.inOut' }, 'fly')
      .to(big.scale, { x: target.scale.x, y: target.scale.y, z: target.scale.z, duration: 0.7, ease: 'power2.inOut' }, 'fly');
    try {
      big.rotateX(THREE.MathUtils.degToRad(T.pitchDeg || 0));
      big.rotateY(THREE.MathUtils.degToRad(T.yawDeg || 0));
      big.rotateZ(THREE.MathUtils.degToRad(T.rollDeg || 0));
    } catch {}
  });

  try { cardGroup.remove(big); } catch {}
  if (typeof window !== 'undefined') window.drawAnimationActive = false;
  try { if (typeof window !== 'undefined' && window.refreshInputLockUI) window.refreshInputLockUI(); } catch {}
}


