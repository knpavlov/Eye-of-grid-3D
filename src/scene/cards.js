// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

export function getCachedTexture(url) {
  const THREE = getTHREE();
  const { renderer } = getCtx();
  if (!getCachedTexture.cache) getCachedTexture.cache = new Map();
  if (getCachedTexture.cache.has(url)) return getCachedTexture.cache.get(url);
  const tex = new THREE.TextureLoader().load(url, (t) => {
    try { t.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1; } catch {}
    try { if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; } catch {}
    try { if (typeof window !== 'undefined' && typeof window.requestCardsRedraw === 'function') window.requestCardsRedraw(); } catch {}
  });
  try { tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1; } catch {}
  try { if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; } catch {}
  getCachedTexture.cache.set(url, tex);
  return tex;
}

export function preloadCardTextures() {
  try {
    CARD_TEX.front    = getCachedTexture('textures/card_front_final.jpeg');
    CARD_TEX.back     = getCachedTexture('textures/card_back_main.jpeg');
    CARD_TEX.deckSide = getCachedTexture('textures/card_deck_side_view.jpeg');
  } catch {}
  try { if (typeof window !== 'undefined') window.CARD_TEX = CARD_TEX; } catch {}
}

export function drawCardFace(ctx, cardData, width, height, hpOverride = null, atkOverride = null) {
  const THREE = getTHREE();
  const BASE_W = 256;
  const BASE_H = 356;
  const scaleX = width / BASE_W;
  const scaleY = height / BASE_H;
  const scale = (scaleX + scaleY) / 2;
  const px = (val) => Math.round(val * scaleX);
  const py = (val) => Math.round(val * scaleY);
  const ps = (val) => Math.max(1, Math.round(val * scale));

  // Фон карты (текстура или мягкий градиент в качестве запасного варианта)
  try {
    const imgFront = CARD_TEX.front && CARD_TEX.front.image ? CARD_TEX.front.image : null;
    if (imgFront && imgFront.width && imgFront.height) {
      ctx.drawImage(imgFront, 0, 0, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1e293b'); gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }
  } catch {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1e293b'); gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }

  // Цветная рамка в цвет стихии
  const border = Math.max(2, ps(3));
  ctx.strokeStyle = getElementColor(cardData.element);
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, width - border, height - border);

  // Верхний блок: имя и короткая подпись
  const elementLabels = { FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', FOREST: 'Forest', BIOLITH: 'Biolith', NEUTRAL: 'Neutral' };
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  const nameMaxWidth = width - px(64);
  let displayName = (cardData.name || '').trim();
  if (displayName.length > 40) displayName = displayName.slice(0, 40) + '…';
  let nameFont = Math.max(ps(9), 9);
  const minNameFont = Math.max(ps(7), 7);
  while (true) {
    ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
    if (ctx.measureText(displayName).width <= nameMaxWidth || nameFont <= minNameFont) break;
    nameFont = Math.max(minNameFont, nameFont - 1);
  }
  ctx.fillText(displayName, width / 2, py(44));

  const typeParts = [];
  const elementLabel = elementLabels[cardData.element] || elementLabels.NEUTRAL;
  if (elementLabel) typeParts.push(elementLabel);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  if (typeLine) {
    ctx.font = `500 ${Math.max(ps(7), 7)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillStyle = 'rgba(226,232,240,0.82)';
    ctx.fillText(typeLine, width / 2, py(62));
  }

  // Рамка под иллюстрацию
  const illX = px(24);
  const illY = py(72);
  const illW = width - px(48);
  const illH = py(148);
  ctx.save();
  ctx.fillStyle = 'rgba(8, 15, 32, 0.55)';
  ctx.fillRect(illX, illY, illW, illH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = Math.max(1, ps(1.2));
  ctx.strokeRect(illX, illY, illW, illH);
  ctx.restore();

  // Попытка загрузить иллюстрацию
  let img = CARD_IMAGES[cardData.id] || CARD_IMAGES[cardData.id?.toLowerCase?.()] || CARD_IMAGES[(cardData.name||'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').replace(/\s+/g,'_')];
  if (!img && !CARD_PENDING[cardData.id]) {
    CARD_PENDING[cardData.id] = true;
    const candidates = [
      `card images/${cardData.id}.png`,
      `card images/${(cardData.id||'').toLowerCase()}.png`,
      `card images/${(cardData.name||'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').replace(/\s+/g,'_')}.png`,
      `card images/${(cardData.name||'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').replace(/\s+/g,'-')}.png`
    ];
    (function tryLoad(i){
      if (i>=candidates.length) { CARD_PENDING[cardData.id] = false; return; }
      const im = new Image();
      im.onload = () => { CARD_IMAGES[cardData.id] = im; CARD_PENDING[cardData.id] = false; try { if (window.requestCardsRedraw) window.requestCardsRedraw(); } catch {} };
      im.onerror = () => tryLoad(i+1);
      im.src = encodeURI(candidates[i]);
    })(0);
  }
  if (img && img.complete && !(typeof location !== 'undefined' && location.protocol === 'file:')) {
    const ar = img.width / img.height;
    let w = illW, h = illH;
    if (w / h > ar) { w = h * ar; } else { h = w / ar; }
    const dx = illX + (illW - w) / 2;
    const dy = illY + (illH - h) / 2;
    try { ctx.drawImage(img, dx, dy, w, h); } catch {}
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 ${Math.max(ps(7.5), 8)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillText('Illustration', width / 2, illY + Math.round(illH / 2));
  }

  // Текстовое поле (уменьшенный шрифт и контролируемая высота)
  const text = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${Math.max(ps(8.5), 9)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'left';
  const textX = illX;
  const textY = illY + illH + Math.max(ps(8), 6);
  const textWidth = illW;
  const diagramTop = cardData.type === 'UNIT' ? (height - py(122)) : (height - py(78));
  const textMaxY = diagramTop - Math.max(ps(6), 6);
  wrapText(ctx, text, textX, textY, textWidth, Math.max(ps(11), 12), textMaxY);

  // Нижний пояс карты с ресурсами
  const footerHeight = Math.max(py(52), Math.round(40 * scaleY));
  ctx.fillStyle = 'rgba(8, 12, 24, 0.58)';
  ctx.fillRect(0, height - footerHeight, width, footerHeight);

  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'left';
  const iconSize = Math.max(ps(16), 14);
  const footerCenterY = height - Math.round(footerHeight * 0.58);
  const manaCenterX = px(28);
  drawManaOrbIcon(ctx, manaCenterX, footerCenterY, iconSize);
  const costTextX = manaCenterX + iconSize / 2 + Math.max(ps(6), 6);
  const costBaseline = footerCenterY + Math.max(ps(4), 4);
  const costValue = String(cardData.cost ?? 0);
  ctx.font = `700 ${Math.max(ps(11), 11)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.fillText(costValue, costTextX, costBaseline);
  let inlineOffset = ctx.measureText(costValue).width;

  if (cardData.locked) {
    const lockSize = Math.max(ps(14), 12);
    const lockCenterX = costTextX + inlineOffset + lockSize / 2 + Math.max(ps(6), 4);
    drawLockIcon(ctx, lockCenterX, footerCenterY, lockSize);
    inlineOffset += lockSize + Math.max(ps(6), 4);
  }

  if (cardData.type === 'UNIT') {
    const act = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const playSize = Math.max(ps(15), 13);
    const playCenterX = costTextX + inlineOffset + playSize / 2 + Math.max(ps(12), 10);
    drawPlayIcon(ctx, playCenterX, footerCenterY, playSize);
    ctx.fillText(String(act), playCenterX + playSize / 2 + Math.max(ps(4), 4), costBaseline);
    inlineOffset += playSize + Math.max(ps(18), 14);
  }

  if (cardData.type === 'UNIT') {
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statRadius = Math.max(ps(11), 10);
    const hpCenterX = width - px(28);
    const atkCenterX = hpCenterX - statRadius * 2.6;
    drawStatBadge(ctx, atkCenterX, footerCenterY, statRadius, '#fb923c', '#fcd34d', atkToShow);
    drawStatBadge(ctx, hpCenterX, footerCenterY, statRadius, '#f87171', '#fca5a5', hpToShow);

    const cell = Math.max(Math.round(ps(8)), 6);
    const gap = Math.max(Math.round(ps(1.5)), 1);
    const gridW = cell * 3 + gap * 2;
    const spacing = Math.max(Math.round(ps(14)), 10);
    const startX = (width - (gridW * 2 + spacing)) / 2;
    const gridY = diagramTop;
    drawAttacksGrid(ctx, cardData, startX, gridY, cell, gap);
    drawBlindspotGrid(ctx, cardData, startX + gridW + spacing, gridY, cell, gap);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxY = Infinity) {
  if (!text) return;
  const words = text.split(/\s+/);
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      if (y > maxY) return;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line && y <= maxY) ctx.fillText(line, x, y);
}

function getElementColor(element) {
  const colors = { FIRE: '#dc2626', WATER: '#0369a1', EARTH: '#525252', FOREST: '#166534' };
  return colors[element] || '#64748b';
}

// Рисуем иконку орба маны
function drawManaOrbIcon(ctx, x, y, size) {
  const r = size / 2;
  const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.3, '#8bd5ff');
  grd.addColorStop(0.7, '#1ea0ff');
  grd.addColorStop(1, '#0a67b7');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Рисуем иконку play (треугольник)
function drawPlayIcon(ctx, x, y, size) {
  const r = size / 2;
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.7);
  ctx.lineTo(x - r * 0.6, y + r * 0.7);
  ctx.lineTo(x + r * 0.8, y);
  ctx.closePath();
  ctx.fill();
}

// Рисуем иконку замка для Summoning Lock
function drawLockIcon(ctx, x, y, size) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x - r, y - r);
  ctx.lineWidth = size * 0.1;
  ctx.strokeStyle = '#475569';
  ctx.fillStyle = '#e2e8f0';
  // дужка
  const sh = r; // высота дужки
  ctx.beginPath();
  ctx.moveTo(r * 0.5, sh);
  ctx.lineTo(r * 0.5, sh * 0.3);
  ctx.quadraticCurveTo(r, 0, r * 1.5, sh * 0.3);
  ctx.lineTo(r * 1.5, sh);
  ctx.stroke();
  // корпус с закруглёнными углами
  const bodyW = r * 1.6;
  const bodyH = r * 1.4;
  const bodyX = r * 0.2;
  const bodyY = sh;
  const br = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(bodyX + br, bodyY);
  ctx.lineTo(bodyX + bodyW - br, bodyY);
  ctx.quadraticCurveTo(bodyX + bodyW, bodyY, bodyX + bodyW, bodyY + br);
  ctx.lineTo(bodyX + bodyW, bodyY + bodyH - br);
  ctx.quadraticCurveTo(bodyX + bodyW, bodyY + bodyH, bodyX + bodyW - br, bodyY + bodyH);
  ctx.lineTo(bodyX + br, bodyY + bodyH);
  ctx.quadraticCurveTo(bodyX, bodyY + bodyH, bodyX, bodyY + bodyH - br);
  ctx.lineTo(bodyX, bodyY + br);
  ctx.quadraticCurveTo(bodyX, bodyY, bodyX + br, bodyY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // отверстие
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(r, bodyY + bodyH / 2, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAttacksGrid(ctx, cardData, x, y, cell, gap) {
  const attacks = cardData.attacks || [];
  const baseLine = Math.max(1, Math.round(cell * 0.18));
  const accentLine = Math.max(1, Math.round(cell * 0.2));

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(30,41,59,0.62)';
      if (r === 1 && c === 1) ctx.fillStyle = 'rgba(15,23,42,0.92)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = baseLine;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }

  if (cardData.attackType === 'MAGIC') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue;
        const cx = x + c * (cell + gap);
        const cy = y + r * (cell + gap);
        ctx.fillStyle = 'rgba(56,189,248,0.28)';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = 'rgba(56,189,248,0.65)';
        ctx.lineWidth = accentLine;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      }
    }
    const frontX = x + 1 * (cell + gap);
    const frontY = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = accentLine;
    ctx.strokeRect(frontX + 0.5, frontY + 0.5, cell - 1, cell - 1);
    return;
  }

  const map = { N: [-1,0], E:[0,1], S:[1,0], W:[0,-1] };
  for (const a of attacks) {
    const isChoice = cardData.chooseDir || a.mode === 'ANY';
    const minDist = Math.min(...(a.ranges || [1]));
    for (const dist of a.ranges || []) {
      const vec = map[a.dir];
      if (!vec) continue;
      const rr = 1 + vec[0] * dist;
      const cc = 1 + vec[1] * dist;
      const cx = x + cc * (cell + gap);
      const cy = y + rr * (cell + gap);
      ctx.fillStyle = 'rgba(56,189,248,0.28)';
      ctx.fillRect(cx, cy, cell, cell);
      const multi = (!a.mode || a.mode !== 'ANY') && (a.ranges && a.ranges.length > 1);
      const mustHit = (!isChoice) && (multi || dist === minDist);
      ctx.strokeStyle = mustHit ? '#ef4444' : 'rgba(56,189,248,0.65)';
      ctx.lineWidth = accentLine;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }

  if (cardData.chooseDir || attacks.some(a => a.mode === 'ANY')) {
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = accentLine;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  }
}

function drawBlindspotGrid(ctx, cardData, x, y, cell, gap) {
  const blind = (cardData.blindspots && cardData.blindspots.length) ? cardData.blindspots : ['S'];
  const baseLine = Math.max(1, Math.round(cell * 0.18));
  const accentLine = Math.max(1, Math.round(cell * 0.2));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(30,41,59,0.62)';
      if (r === 1 && c === 1) ctx.fillStyle = 'rgba(234,179,8,0.45)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = baseLine;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      const isN = (r === 0 && c === 1);
      const isE = (r === 1 && c === 2);
      const isS = (r === 2 && c === 1);
      const isW = (r === 1 && c === 0);
      if ((isN && blind.includes('N')) || (isE && blind.includes('E')) || (isS && blind.includes('S')) || (isW && blind.includes('W'))) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = accentLine;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      }
    }
  }
}

// Компактный маркер для атаки/здоровья, напоминающий оригинальные жетоны
function drawStatBadge(ctx, x, y, radius, fillColor, strokeColor, value) {
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1, radius * 0.22);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.max(10, Math.round(radius * 1.2))}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x, y + radius * 0.08);
  ctx.restore();
}

function attachIllustrationPlane(cardMesh, cardData) {
  const THREE = getTHREE();
  if (!cardMesh || !cardData) return;
  const prev = cardMesh.children?.find(ch => ch.userData && ch.userData.kind === 'illustrationPlane');
  if (prev) { try { cardMesh.remove(prev); } catch {} }
  const img = CARD_IMAGES[cardData.id] || CARD_IMAGES[cardData.id?.toLowerCase?.()] || CARD_IMAGES[(cardData.name||'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').replace(/\s+/g,'_')];
  const W = 256, H = 356; const illX = 16, illY = 70, illW = W - 32, illH = 120;
  const w = cardMesh.geometry.parameters.width; const t = cardMesh.geometry.parameters.height; const h = cardMesh.geometry.parameters.depth;
  const planeW = w * (illW / W); const planeH = h * (illH / H);
  const centerX = (illX + illW/2) / W; const centerY = (illY + illH/2) / H;
  const offsetX = (centerX - 0.5) * w; const offsetZ = (centerY - 0.5) * h;
  if (!img || !img.complete) {
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const cx = c.getContext('2d');
      const grd = cx.createLinearGradient(0,0,64,64); grd.addColorStop(0,'#1e293b'); grd.addColorStop(1,'#334155');
      cx.fillStyle = grd; cx.fillRect(0,0,64,64);
      cx.fillStyle = '#94a3b8'; cx.font = '10px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('Loading.', 32, 32);
      const tex = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const geom = new THREE.PlaneGeometry(planeW, planeH);
      const plane = new THREE.Mesh(geom, mat);
      plane.rotation.x = -Math.PI/2; plane.position.set(offsetX, (t/2) + 0.001, offsetZ);
      plane.renderOrder = (cardMesh.renderOrder || 1200) + 1; plane.userData = { kind: 'illustrationPlane' };
      cardMesh.add(plane);
    } catch {}
    return;
  }
  const tex = new THREE.Texture(img); tex.needsUpdate = true; if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const geom = new THREE.PlaneGeometry(planeW, planeH);
  const plane = new THREE.Mesh(geom, mat);
  plane.rotation.x = -Math.PI/2; plane.position.set(offsetX, (t/2) + 0.001, offsetZ);
  plane.renderOrder = (cardMesh.renderOrder || 1200) + 1; plane.userData = { kind: 'illustrationPlane' };
  cardMesh.add(plane);
}

export function createCard3D(cardData, isInHand = false, hpOverride = null, atkOverride = null) {
  const THREE = getTHREE();
  const { renderer, cardGroup } = getCtx();
  const cardWidth = 4.8; const cardHeight = 5.6; const cardThickness = 0.12;
  const geometry = new THREE.BoxGeometry(cardWidth, cardThickness, cardHeight);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 356;
  const ctx2d = canvas.getContext('2d'); drawCardFace(ctx2d, cardData, canvas.width, canvas.height, hpOverride, atkOverride);
  const texture = new THREE.CanvasTexture(canvas); try { texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1; } catch {}
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  const faceMaterial = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.3, roughness: 0.8 });
  const backMap = CARD_TEX.back ? CARD_TEX.back : getCachedTexture('textures/card_back_main.jpeg');
  const backMaterial = new THREE.MeshStandardMaterial({ map: backMap, color: 0xffffff, metalness: 0.2, roughness: 0.9, side: THREE.DoubleSide });
  const materials = [edgeMaterial, edgeMaterial, faceMaterial, backMaterial, edgeMaterial, edgeMaterial];
  const card = new THREE.Mesh(geometry, materials);
  card.castShadow = true; card.receiveShadow = false; card.renderOrder = isInHand ? 3000 : 1200;
  card.userData = { type: 'card', cardData, isInHand, originalPosition: new THREE.Vector3(), originalRotation: new THREE.Euler() };
  if (isInHand) { card.scale.set(0.54, 1, 0.54); }
  try {
    const w = geometry.parameters.width; const t = geometry.parameters.height; const h = geometry.parameters.depth;
    const faceOverlayGeom = new THREE.PlaneGeometry(w, h);
    const faceOverlayMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    faceOverlayMat.depthTest = true; faceOverlayMat.depthWrite = false; faceOverlayMat.polygonOffset = true; faceOverlayMat.polygonOffsetFactor = -2; faceOverlayMat.polygonOffsetUnits = -2;
    const faceOverlay = new THREE.Mesh(faceOverlayGeom, faceOverlayMat); faceOverlay.rotation.x = -Math.PI/2; faceOverlay.position.set(0, (t/2) + 0.002, 0);
    faceOverlay.renderOrder = (card.renderOrder || 1200) + 1; faceOverlay.userData = { kind: 'faceOverlay' }; card.add(faceOverlay);
  } catch {}
  try { if (typeof location !== 'undefined' && location.protocol === 'file:') attachIllustrationPlane(card, cardData); } catch {}
  return card;
}

// Expose caches for legacy access
try { if (typeof window !== 'undefined') { window.__cards = { getCachedTexture, preloadCardTextures, createCard3D, drawCardFace, CARD_TEX, CARD_IMAGES }; } } catch {}

