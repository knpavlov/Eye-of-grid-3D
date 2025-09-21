// Hand rendering and card draw animations
import { getCtx } from './context.js';
import { createCard3D } from './cards.js';

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

// Собирает заранее все положения руки для указанного количества слотов
function buildHandLayout(totalSlots) {
  const layout = [];
  const count = Math.max(0, totalSlots);
  for (let i = 0; i < count; i++) {
    layout.push(computeHandTransform(i, count));
  }
  return layout;
}

// Простейшая стратегия на случай отсутствия данных об игровом состоянии
function createFallbackLayout(handMeshes) {
  const currentCount = Array.isArray(handMeshes) ? handMeshes.length : 0;
  const totalSlots = Math.max(1, currentCount + 1);
  const layout = buildHandLayout(totalSlots);
  const indexByHandIndex = new Map();

  if (Array.isArray(handMeshes)) {
    handMeshes.forEach((mesh, orderIdx) => {
      const handIdx = (mesh?.userData && typeof mesh.userData.handIndex === 'number')
        ? mesh.userData.handIndex
        : orderIdx;
      if (!indexByHandIndex.has(handIdx)) {
        indexByHandIndex.set(handIdx, Math.min(orderIdx, Math.max(0, layout.length - 1)));
      }
    });
  }

  const newCardLayoutIndex = Math.max(0, Math.min(layout.length - 1, totalSlots - 1));
  const targetTransform = layout[newCardLayoutIndex] || computeHandTransform(newCardLayoutIndex, totalSlots);

  return {
    layout,
    indexByHandIndex,
    newCardLayoutIndex,
    newCardHandIndex: null,
    targetTransform,
  };
}

// Рассчитывает предстоящее расположение всех карт в руке после добора новой
function predictHandLayoutAfterDraw(cardTpl, handMeshes) {
  const fallback = createFallbackLayout(handMeshes);
  const w = (typeof window !== 'undefined') ? window : null;
  const gs = w?.gameState;
  const players = gs?.players;
  const viewerSeat = (typeof w?.MY_SEAT === 'number')
    ? w.MY_SEAT
    : ((gs && typeof gs.active === 'number') ? gs.active : null);

  if (viewerSeat == null || !players || !Array.isArray(players[viewerSeat]?.hand)) {
    return fallback;
  }

  const playerHand = players[viewerSeat].hand.slice();
  let cardHandIndex = playerHand.findIndex(card => card === cardTpl);
  if (cardHandIndex === -1) {
    playerHand.push(cardTpl);
    cardHandIndex = playerHand.length - 1;
  }

  const pendingRawNum = Number(w?.pendingDrawCount ?? 0);
  const safePendingRaw = Number.isFinite(pendingRawNum) ? Math.max(0, Math.floor(pendingRawNum)) : 0;
  const pendingAfter = Math.max(0, safePendingRaw - 1);
  const sliceTo = Math.max(0, playerHand.length - pendingAfter);
  const visibleHand = playerHand.slice(0, sliceTo);

  const hiddenSet = new Set(
    Array.isArray(w?.PENDING_HIDE_HAND_CARDS)
      ? w.PENDING_HIDE_HAND_CARDS.filter(i => Number.isInteger(i))
      : []
  );

  const ritualIndex = (viewerSeat === gs?.active && typeof w?.pendingRitualSpellHandIndex === 'number')
    ? w.pendingRitualSpellHandIndex
    : null;

  const visibleIndices = [];
  for (let i = 0; i < visibleHand.length; i++) {
    if (ritualIndex != null && i === ritualIndex) continue;
    if (hiddenSet.has(i)) continue;
    visibleIndices.push(i);
  }

  if (visibleIndices.length === 0) {
    const layout = buildHandLayout(1);
    const targetTransform = layout[0] || computeHandTransform(0, 1);
    const indexByHandIndex = new Map([[cardHandIndex, 0]]);
    return {
      layout,
      indexByHandIndex,
      newCardLayoutIndex: 0,
      newCardHandIndex: cardHandIndex,
      targetTransform,
    };
  }

  const layout = visibleIndices.map((_, orderIdx) => computeHandTransform(orderIdx, visibleIndices.length));
  const indexByHandIndex = new Map();
  visibleIndices.forEach((handIdx, orderIdx) => {
    indexByHandIndex.set(handIdx, orderIdx);
  });

  const newCardLayoutIndex = indexByHandIndex.get(cardHandIndex);
  if (newCardLayoutIndex == null || !layout[newCardLayoutIndex]) {
    return fallback;
  }

  return {
    layout,
    indexByHandIndex,
    newCardLayoutIndex,
    newCardHandIndex: cardHandIndex,
    targetTransform: layout[newCardLayoutIndex],
  };
}

// Разворачивает карту так, чтобы её лицевая сторона была направлена прямо на камеру
function orientCardFaceTowardCamera(card, camera) {
  if (!card || !camera) return;
  const THREE = getTHREE();

  try {
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    const faceNormal = camForward.clone().negate().normalize();

    const camUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    let right = new THREE.Vector3().crossVectors(camUpWorld, faceNormal);
    if (right.lengthSq() < 1e-6) {
      right = new THREE.Vector3(1, 0, 0);
    } else {
      right.normalize();
    }
    const upInPlane = new THREE.Vector3().crossVectors(faceNormal, right).normalize();

    const basis = new THREE.Matrix4().makeBasis(right, faceNormal, upInPlane);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    card.setRotationFromQuaternion(q);
  } catch {
    card.rotation.set(0, 0, 0);
  }
}

// Применяет смещения углов Эйлера (в градусах) к переданному повороту
function applyEulerDegreeOffsets(euler, { pitchDeg = 0, yawDeg = 0, rollDeg = 0 } = {}) {
  if (!euler) return;
  const THREE = getTHREE();
  euler.x += THREE.MathUtils.degToRad(pitchDeg || 0);
  euler.y += THREE.MathUtils.degToRad(yawDeg || 0);
  euler.z += THREE.MathUtils.degToRad(rollDeg || 0);
}

// Собирает все материалы меша, чтобы управлять прозрачностью при анимациях
function gatherMeshMaterials(root, sink = []) {
  if (!root) return sink;
  if (root.material) {
    if (Array.isArray(root.material)) sink.push(...root.material);
    else sink.push(root.material);
  }
  (root.children || []).forEach(child => gatherMeshMaterials(child, sink));
  return sink;
}

// Плавно перестраивает текущие карты в руке перед добавлением новой
function relayoutHandDuringDraw(handMeshes, layoutInfo, duration) {
  if (!Array.isArray(handMeshes) || handMeshes.length === 0) return;

  if (!layoutInfo || !Array.isArray(layoutInfo.layout) || layoutInfo.layout.length === 0) return;

  const { layout, indexByHandIndex } = layoutInfo;

  handMeshes.forEach((mesh, idx) => {
    if (!mesh) return;
    const handIdx = (mesh.userData && typeof mesh.userData.handIndex === 'number')
      ? mesh.userData.handIndex
      : idx;
    const orderIdx = indexByHandIndex.has(handIdx) ? indexByHandIndex.get(handIdx) : idx;
    const safeIdx = Math.max(0, Math.min(layout.length - 1, orderIdx));
    const t = layout[safeIdx];
    if (!t) return;
    gsap.to(mesh.position, {
      x: t.position.x,
      y: t.position.y,
      z: t.position.z,
      duration,
      ease: 'power2.inOut'
    });
    gsap.to(mesh.rotation, {
      x: t.rotation.x,
      y: t.rotation.y,
      z: t.rotation.z,
      duration,
      ease: 'power2.inOut'
    });
    gsap.to(mesh.scale, { x: 0.54, y: 1, z: 0.54, duration: Math.min(0.2, duration * 0.3) });
    try { mesh.userData.originalPosition.copy(t.position); } catch {}
    try { mesh.userData.originalRotation.copy(t.rotation); } catch {}
  });
}

// Базовые длительности показа и перелёта добираемой карты
const DRAW_REVEAL_DURATION = 0.7;
const DRAW_FLIGHT_DURATION = 0.7;

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
    if (typeof window !== 'undefined' && window.pendingDrawCount > 0) {
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
  const T = (typeof window !== 'undefined' ? window.DRAW_CARD_TUNE || {} : {});
  big.position.set(0, (T.posY ?? 10.0), (T.posZ ?? 2.4));

  // Подготавливаем изначальный поворот, чтобы карта сразу смотрела на игрока
  orientCardFaceTowardCamera(big, camera);
  applyEulerDegreeOffsets(big.rotation, {
    pitchDeg: T.initialPitchDeg ?? 30,
    yawDeg: T.initialYawDeg ?? 0,
    rollDeg: T.initialRollDeg ?? 0
  });

  big.scale.set((T.scale ?? 1.7), (T.scale ?? 1.7), (T.scale ?? 1.7));
  big.renderOrder = 9000;

  const allMaterials = gatherMeshMaterials(big, []);
  allMaterials.forEach(m => { if (m) { m.transparent = true; m.opacity = 0; } });
  cardGroup.add(big);

  const revealDuration = DRAW_REVEAL_DURATION;
  const flightDuration = DRAW_FLIGHT_DURATION;

  const handMeshes = (ctx.handCardMeshes || []).filter(m => m?.userData?.isInHand);
  const layoutInfo = predictHandLayoutAfterDraw(cardTpl, handMeshes);
  const fallbackTarget = computeHandTransform(
    Math.max(0, handMeshes.length),
    Math.max(1, handMeshes.length + 1)
  );
  const target = layoutInfo?.targetTransform || fallbackTarget;

  try {
    relayoutHandDuringDraw(handMeshes, layoutInfo, revealDuration);
  } catch {}

  const flightRotation = target.rotation.clone();
  try {
    applyEulerDegreeOffsets(flightRotation, {
      pitchDeg: T.pitchDeg || 0,
      yawDeg: T.yawDeg || 0,
      rollDeg: T.rollDeg || 0
    });
  } catch {}

  try {
    await new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });

      tl.to(allMaterials, {
        opacity: 1,
        duration: revealDuration,
        ease: 'power2.out'
      });

      tl.to(big.position, {
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
        duration: flightDuration,
        ease: 'power2.inOut'
      })
        .to(big.rotation, {
          x: flightRotation.x,
          y: flightRotation.y,
          z: flightRotation.z,
          duration: flightDuration,
          ease: 'power2.inOut'
        }, '<')
        .to(big.scale, {
          x: target.scale.x,
          y: target.scale.y,
          z: target.scale.z,
          duration: flightDuration,
          ease: 'power2.inOut'
        }, '<');
    });
  } catch {}

  try { cardGroup.remove(big); } catch {}
  if (typeof window !== 'undefined') window.drawAnimationActive = false;
  try { if (typeof window !== 'undefined' && window.refreshInputLockUI) window.refreshInputLockUI(); } catch {}
}


