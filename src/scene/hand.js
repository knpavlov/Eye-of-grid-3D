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

// Собирает предрасчётную раскладку руки для всех индексов
function computeHandLayout(total) {
  const transforms = [];
  const cappedTotal = Math.max(0, total | 0);
  for (let i = 0; i < cappedTotal; i++) {
    transforms.push(computeHandTransform(i, cappedTotal));
  }
  return transforms;
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

function clamp01(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

// Плавно переводит значение в диапазоне [0, 1], чтобы убрать резкие границы
function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function eulersDiffer(a, b, epsilon = 1e-4) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) > epsilon ||
    Math.abs(a.y - b.y) > epsilon ||
    Math.abs(a.z - b.z) > epsilon
  );
}

function slerpEuler(fromEuler, toEuler, ratio) {
  const THREE = getTHREE();
  if (!fromEuler && !toEuler) return new THREE.Euler();
  if (!fromEuler) return toEuler.clone();
  if (!toEuler) return fromEuler.clone();

  const amount = clamp01(ratio);
  if (amount <= 0) return fromEuler.clone();
  if (amount >= 1) return toEuler.clone();

  const fromQuat = new THREE.Quaternion().setFromEuler(fromEuler);
  const toQuat = new THREE.Quaternion().setFromEuler(toEuler);
  const blended = fromQuat.clone().slerp(toQuat, amount);
  const order = fromEuler.order || toEuler.order || 'XYZ';
  return new THREE.Euler().setFromQuaternion(blended, order);
}

// Вычисляет тайминги фаз поворота добираемой карты для разнесения визуальных шагов
function computeRotationPhaseTimings(flightDuration, tune = {}) {
  const flight = Math.max(0, typeof flightDuration === 'number' ? flightDuration : 0);
  const rotationLeadOverride = Number.isFinite(tune.rotationLead) ? tune.rotationLead : undefined;
  const rotationLeadShare = clamp01(Number.isFinite(tune.rotationLeadShare) ? tune.rotationLeadShare : DEFAULT_ROTATION_LEAD_SHARE);
  const rotationLead = Math.max(0, Math.min(flight, rotationLeadOverride ?? (flight * rotationLeadShare)));

  const settleStartTime = Math.max(0, flight - rotationLead);
  const rotationLeanDelayRaw = Number.isFinite(tune.rotationLeanDelay) ? tune.rotationLeanDelay : DEFAULT_ROTATION_LEAN_DELAY;
  const rotationLeanDelay = Math.max(0, Math.min(settleStartTime, rotationLeanDelayRaw));
  const leanStartTime = Math.max(0, Math.min(rotationLeanDelay, settleStartTime));
  const leanDuration = Math.max(0, settleStartTime - leanStartTime);

  const rotationLeanFraction = clamp01(tune.rotationLeanFraction ?? DEFAULT_DRAW_ROTATION_LEAN_FRACTION);
  const rotationTiltShare = clamp01(tune.rotationTiltShare ?? DEFAULT_DRAW_ROTATION_TILT_SHARE);
  const tiltDuration = rotationLead * smoothstep01(rotationTiltShare);
  const settleDuration = Math.max(0, rotationLead - tiltDuration);

  return {
    rotationLead,
    settleStartTime,
    leanStartTime,
    leanDuration,
    rotationLeanFraction,
    rotationTiltShare,
    tiltDuration,
    settleDuration
  };
}

// Строит сегменты траектории полёта, чтобы карта подлетала из безопасного сектора
function computeDrawFlightSegments(startPosition, targetTransform, tune = {}) {
  const THREE = getTHREE();
  const start = startPosition ? startPosition.clone() : new THREE.Vector3();
  const targetPosition = targetTransform?.position?.clone ? targetTransform.position.clone() : new THREE.Vector3();

  const arcHeight = Number.isFinite(tune.flightArcHeight) ? tune.flightArcHeight : DEFAULT_DRAW_FLIGHT_ARC_HEIGHT;
  const arcOffsetX = Number.isFinite(tune.flightArcOffsetX) ? tune.flightArcOffsetX : DEFAULT_DRAW_FLIGHT_ARC_OFFSET_X;
  const arcPull = Number.isFinite(tune.flightArcPull) ? tune.flightArcPull : DEFAULT_DRAW_FLIGHT_ARC_PULL;
  const arcShareRaw = Number.isFinite(tune.flightArcShare) ? tune.flightArcShare : DEFAULT_DRAW_FLIGHT_ARC_SHARE;
  const arcShare = clamp01(arcShareRaw);

  const segments = [];
  if (arcShare > 1e-4) {
    const midPoint = targetPosition.clone();
    midPoint.x += arcOffsetX;
    midPoint.y += arcHeight;
    midPoint.z += arcPull;
    if (midPoint.distanceTo(start) > 1e-4 && midPoint.distanceTo(targetPosition) > 1e-4) {
      segments.push({ position: midPoint, share: Math.min(arcShare, 0.9) });
    }
  }

  const consumedShare = segments.reduce((acc, seg) => acc + seg.share, 0);
  const remainingShare = Math.max(0.0001, 1 - consumedShare);
  segments.push({ position: targetPosition, share: remainingShare });

  return segments;
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
function relayoutHandDuringDraw(handMeshes, layoutAfterDraw, duration) {
  if (!Array.isArray(handMeshes) || handMeshes.length === 0) return;

  handMeshes.forEach((mesh, idx) => {
    const t = layoutAfterDraw?.[idx];
    if (!t) return;
    gsap.to(mesh.position, {
      x: t.position.x,
      y: t.position.y,
      z: t.position.z,
      duration,
      ease: 'power2.inOut'
    });
    const rotationDuration = duration > 0 ? duration * HAND_ROTATION_DURATION_MULTIPLIER : duration;
    gsap.to(mesh.rotation, {
      x: t.rotation.x,
      y: t.rotation.y,
      z: t.rotation.z,
      duration: rotationDuration,
      ease: HAND_ROTATION_EASE
    });
    gsap.to(mesh.scale, { x: 0.54, y: 1, z: 0.54, duration: Math.min(0.2, duration * 0.3) });
    try { mesh.userData.originalPosition.copy(t.position); } catch {}
    try { mesh.userData.originalRotation.copy(t.rotation); } catch {}
  });
}

// Базовые длительности показа и перелёта добираемой карты
const DRAW_REVEAL_DURATION = 0.7;
const DRAW_FLIGHT_DURATION = 0.7;
// Дефолтный масштаб крупного отображения карты при доборе
const DEFAULT_DRAW_CARD_SCALE = 1.4;
// Высота дуги траектории подлёта карты над целевой точкой
const DEFAULT_DRAW_FLIGHT_ARC_HEIGHT = 1.2;
// Смещение по оси X для подлёта «справа-сверху», чтобы не задевать край соседних карт
const DEFAULT_DRAW_FLIGHT_ARC_OFFSET_X = 0.35;
// Смещение по оси Z для подлёта слегка ближе к игроку
const DEFAULT_DRAW_FLIGHT_ARC_PULL = -0.6;
// Доля времени полёта, отводимая на дугу подлёта
const DEFAULT_DRAW_FLIGHT_ARC_SHARE = 0.62;
// Сколько долей от длительности полёта занимает досаживание поворота
const DEFAULT_ROTATION_LEAD_SHARE = 0.64;
// Насколько долго карта держит исходный наклон перед началом плавного поворота в полёте
const DEFAULT_ROTATION_LEAN_DELAY = 0.02;
// Какую долю «поворота» добираемой карты выполняем до финальной досадки
const DEFAULT_DRAW_ROTATION_LEAN_FRACTION = 0.72;
// Какая часть финального промежутка отводится на удержание полётного наклона
const DEFAULT_DRAW_ROTATION_TILT_SHARE = 0.3;
// Плавные кривые для фаз появления и движения добираемой карты
const DRAW_REVEAL_EASE = 'sine.out';
const DRAW_FLIGHT_EASE = 'sine.inOut';
const DRAW_SCALE_EASE = 'sine.inOut';
// Плавные кривые для фаз поворота добираемой карты
const DRAW_ROTATION_LEAN_EASE = 'sine.inOut';
const DRAW_ROTATION_TILT_EASE = 'sine.inOut';
const DRAW_ROTATION_SETTLE_EASE = 'sine.inOut';
// Параметры плавности поворота карт, уже лежащих в руке
const HAND_ROTATION_DURATION_MULTIPLIER = 1.15;
const HAND_ROTATION_EASE = 'sine.inOut';

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
  const initialPosition = big.position.clone();

  // Подготавливаем изначальный поворот, чтобы карта сразу смотрела на игрока
  orientCardFaceTowardCamera(big, camera);
  applyEulerDegreeOffsets(big.rotation, {
    pitchDeg: T.initialPitchDeg ?? 30,
    yawDeg: T.initialYawDeg ?? 0,
    rollDeg: T.initialRollDeg ?? 0
  });

  const initialRotation = big.rotation.clone();

  const drawScale = (T.scale ?? DEFAULT_DRAW_CARD_SCALE);
  big.scale.set(drawScale, drawScale, drawScale);
  big.renderOrder = 9000;

  const allMaterials = gatherMeshMaterials(big, []);
  allMaterials.forEach(m => { if (m) { m.transparent = true; m.opacity = 0; } });
  cardGroup.add(big);

  const revealDuration = DRAW_REVEAL_DURATION;
  const flightDuration = DRAW_FLIGHT_DURATION;
  const flightSegments = computeDrawFlightSegments(initialPosition, target, T);

  const handMeshes = (ctx.handCardMeshes || []).filter(m => m?.userData?.isInHand);
  const totalVisible = Math.max(0, handMeshes.length);
  const totalAfter = totalVisible + 1;
  const indexAfter = totalAfter - 1;
  const layoutAfterDraw = computeHandLayout(totalAfter);
  const target = layoutAfterDraw[indexAfter] || computeHandTransform(indexAfter, totalAfter);

  try {
    relayoutHandDuringDraw(handMeshes, layoutAfterDraw, revealDuration);
  } catch {}

  const arrivalRotation = target.rotation.clone();
  const flightRotation = target.rotation.clone();
  try {
    applyEulerDegreeOffsets(flightRotation, {
      pitchDeg: T.pitchDeg || 0,
      yawDeg: T.yawDeg || 0,
      rollDeg: T.rollDeg || 0
    });
  } catch {}

  // Запускаем финальное выравнивание угла заранее, чтобы оно шло в полёте
  const rotationPlan = computeRotationPhaseTimings(flightDuration, T);
  const {
    rotationLead,
    settleStartTime,
    leanStartTime,
    leanDuration,
    rotationLeanFraction,
    tiltDuration,
    settleDuration
  } = rotationPlan;
  const leanRotation = slerpEuler(initialRotation, flightRotation, smoothstep01(rotationLeanFraction));

  try {
    await new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });

      tl.to(allMaterials, {
        opacity: 1,
        duration: revealDuration,
        ease: DRAW_REVEAL_EASE
      });

      tl.addLabel('flightMotion');

      let flightSegmentOffset = 0;
      flightSegments.forEach(seg => {
        const segDuration = flightDuration * (seg.share || 0);
        const segLabel = `flightMotion+=${flightSegmentOffset}`;
        const segEase = seg.ease || DRAW_FLIGHT_EASE;
        if (segDuration <= 0.0001) {
          tl.set(big.position, {
            x: seg.position.x,
            y: seg.position.y,
            z: seg.position.z
          }, segLabel);
        } else {
          tl.to(big.position, {
            x: seg.position.x,
            y: seg.position.y,
            z: seg.position.z,
            duration: segDuration,
            ease: segEase
          }, segLabel);
        }
        flightSegmentOffset += segDuration;
      });

      tl.to(big.scale, {
          x: target.scale.x,
          y: target.scale.y,
          z: target.scale.z,
          duration: flightDuration,
          ease: DRAW_SCALE_EASE
        }, 'flightMotion');

      const leanStartLabel = `flightMotion+=${leanStartTime}`;
      const leanFinishLabel = `flightMotion+=${settleStartTime}`;
      if (leanDuration > 0.0001 && eulersDiffer(initialRotation, leanRotation)) {
        tl.to(big.rotation, {
          x: leanRotation.x,
          y: leanRotation.y,
          z: leanRotation.z,
          duration: leanDuration,
          ease: DRAW_ROTATION_LEAN_EASE
        }, leanStartLabel);
      } else if (eulersDiffer(initialRotation, leanRotation)) {
        tl.set(big.rotation, {
          x: leanRotation.x,
          y: leanRotation.y,
          z: leanRotation.z
        }, leanFinishLabel);
      }

      const tiltStart = `flightMotion+=${settleStartTime}`;
      if (tiltDuration > 0.0001 && eulersDiffer(leanRotation, flightRotation)) {
        tl.to(big.rotation, {
          x: flightRotation.x,
          y: flightRotation.y,
          z: flightRotation.z,
          duration: tiltDuration,
          ease: DRAW_ROTATION_TILT_EASE
        }, tiltStart);
      } else if (rotationLead > 0.0001 && eulersDiffer(leanRotation, flightRotation)) {
        tl.set(big.rotation, {
          x: flightRotation.x,
          y: flightRotation.y,
          z: flightRotation.z
        }, tiltStart);
      }

      const settleStart = `flightMotion+=${settleStartTime + tiltDuration}`;
      if (settleDuration > 0.0001 && eulersDiffer(flightRotation, arrivalRotation)) {
        tl.to(big.rotation, {
          x: arrivalRotation.x,
          y: arrivalRotation.y,
          z: arrivalRotation.z,
          duration: settleDuration,
          ease: DRAW_ROTATION_SETTLE_EASE
        }, settleStart);
      } else {
        tl.set(big.rotation, {
          x: arrivalRotation.x,
          y: arrivalRotation.y,
          z: arrivalRotation.z
        }, settleStart);
      }
    });
  } catch {}

  try { cardGroup.remove(big); } catch {}
  if (typeof window !== 'undefined') window.drawAnimationActive = false;
  try { if (typeof window !== 'undefined' && window.refreshInputLockUI) window.refreshInputLockUI(); } catch {}
}


