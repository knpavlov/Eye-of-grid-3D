// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};
// Наблюдатели, которым нужно перерисовать 2D-вью карточек при подгрузке текстур
const CARD_FACE_LISTENERS = new Set();

function notifyCardFaceListeners() {
  CARD_FACE_LISTENERS.forEach(cb => {
    try { cb(); } catch (err) { console.error('[cards] repaint listener failed', err); }
  });
}

export function subscribeCardFaceUpdates(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  CARD_FACE_LISTENERS.add(listener);
  return () => CARD_FACE_LISTENERS.delete(listener);
}

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
    try { notifyCardFaceListeners(); } catch {}
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
  const scale = width / 256;
  const padding = 14 * scale;
  const safeX = padding;
  const safeY = padding;
  const safeW = width - padding * 2;
  const safeH = height - padding * 2;
  const bannerH = 46 * scale;
  const artGap = 10 * scale;
  const artH = 142 * scale;
  const artX = safeX + 6 * scale;
  const artY = safeY + bannerH + artGap;
  const artW = safeW - 12 * scale;
  const statsH = 62 * scale;
  const bodyTop = artY + artH + artGap;
  const bodyBottom = height - padding - statsH - 10 * scale;
  const bodyH = Math.max(48 * scale, bodyBottom - bodyTop);
  const gridCell = 12 * scale;
  const gridGap = 2 * scale;
  const gridSpacing = 14 * scale;
  const gridWidth = gridCell * 3 + gridGap * 2;
  const gridsTotalWidth = gridWidth * 2 + gridSpacing;
  const textBoxW = Math.max(80 * scale, safeW - 18 * scale - gridsTotalWidth);
  const textBoxX = safeX + 6 * scale;
  const textBoxY = bodyTop;
  const gridsX = textBoxX + textBoxW + 12 * scale;
  const gridsY = bodyTop + 4 * scale;
  const statsY = height - padding - statsH;

  // Фон карты — используем текстуру, чтобы повторить оформление из игры
  try {
    const imgFront = CARD_TEX.front && CARD_TEX.front.image ? CARD_TEX.front.image : null;
    if (imgFront && imgFront.width && imgFront.height) {
      ctx.drawImage(imgFront, 0, 0, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1f2937'); gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }
  } catch {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1f2937'); gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }

  const frameColor = 'rgba(148,163,184,0.45)';
  drawRoundedFrame(ctx, safeX - 4 * scale, safeY - 4 * scale, safeW + 8 * scale, safeH + 8 * scale, 22 * scale, frameColor);
  drawRoundedFrame(ctx, safeX, safeY, safeW, safeH, 18 * scale, 'rgba(15,23,42,0.75)');

  // Верхний баннер с именем
  drawRoundedRect(ctx, safeX + 4 * scale, safeY + 4 * scale, safeW - 8 * scale, bannerH, 12 * scale, 'rgba(15,23,42,0.82)', 'rgba(148,163,184,0.25)');
  const elementEmoji = (typeof window !== 'undefined' && window.elementEmoji) || {};
  const name = (cardData.name || '').length > 26 ? `${(cardData.name || '').slice(0, 23)}…` : (cardData.name || '');
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.max(10, Math.round(14 * scale))}px "Cinzel", "Times New Roman", serif`;
  ctx.fillText(name, width / 2, safeY + bannerH / 2 + 6 * scale);
  ctx.font = `${Math.max(9, Math.round(12 * scale))}px "Source Sans Pro", system-ui`;
  ctx.fillStyle = 'rgba(226,232,240,0.75)';
  const subline = cardData.type === 'UNIT' ? 'Creature' : 'Spell';
  ctx.fillText(subline, width / 2, safeY + bannerH - 6 * scale);

  // Бейдж элемента и стоимости
  const badgeY = safeY + bannerH / 2 + 2 * scale;
  drawElementBadge(ctx, width - safeX - 26 * scale, badgeY, 20 * scale, cardData.element, elementEmoji[cardData.element]);
  drawCostBadge(ctx, safeX + 26 * scale, badgeY, 20 * scale, cardData.cost || 0, !!cardData.locked);

  // Иллюстрация
  drawRoundedRect(ctx, artX, artY, artW, artH, 12 * scale, 'rgba(15,23,42,0.55)', 'rgba(148,163,184,0.25)');
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
      im.onload = () => {
        CARD_IMAGES[cardData.id] = im;
        CARD_PENDING[cardData.id] = false;
        try { if (typeof window !== 'undefined' && window.requestCardsRedraw) window.requestCardsRedraw(); } catch {}
        notifyCardFaceListeners();
      };
      im.onerror = () => tryLoad(i+1);
      im.src = encodeURI(candidates[i]);
    })(0);
  }
  if (img && img.complete && !(typeof location !== 'undefined' && location.protocol === 'file:')) {
    const ar = img.width / img.height;
    let w = artW - 10 * scale;
    let h = artH - 10 * scale;
    if (w / h > ar) { w = h * ar; } else { h = w / ar; }
    const dx = artX + (artW - w) / 2;
    const dy = artY + (artH - h) / 2;
    try { ctx.drawImage(img, dx, dy, w, h); } catch {}
  } else {
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.font = `${Math.max(8, Math.round(11 * scale))}px "Source Sans Pro", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('Illustration pending', width / 2, artY + artH / 2 + 4 * scale);
  }

  // Текстовое поле и описание
  drawRoundedRect(ctx, textBoxX, textBoxY, textBoxW, bodyH, 10 * scale, 'rgba(15,23,42,0.7)', 'rgba(148,163,184,0.18)');
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'left';
  const desc = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  const lineHeight = Math.max(12 * scale, 10);
  ctx.font = `${Math.max(9, Math.round(11 * scale))}px "Source Sans Pro", system-ui`;
  wrapText(ctx, desc, textBoxX + 10 * scale, textBoxY + 18 * scale, textBoxW - 20 * scale, lineHeight);

  if (cardData.type === 'UNIT') {
    drawAttacksGrid(ctx, cardData, gridsX, gridsY, gridCell, gridGap);
    drawBlindspotGrid(ctx, cardData, gridsX + gridWidth + gridSpacing, gridsY, gridCell, gridGap);
  }

  // Нижняя панель со статами
  drawRoundedRect(ctx, safeX + 6 * scale, statsY, safeW - 12 * scale, statsH, 16 * scale, 'rgba(15,23,42,0.82)', 'rgba(148,163,184,0.28)');
  const iconSize = 20 * scale;
  const costX = safeX + 24 * scale;
  const centerY = statsY + statsH / 2;
  drawManaOrbIcon(ctx, costX, centerY, iconSize);
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.font = `600 ${Math.max(10, Math.round(14 * scale))}px "Source Sans Pro", system-ui`;
  ctx.fillText(String(cardData.cost || 0), costX + iconSize * 0.7, centerY + 4 * scale);
  let costWidth = ctx.measureText(String(cardData.cost || 0)).width;
  if (cardData.locked) {
    drawLockIcon(ctx, costX + iconSize * 0.9 + costWidth + iconSize * 0.4, centerY, iconSize * 0.9);
    costWidth += iconSize;
  }

  if (cardData.type === 'UNIT') {
    const act = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const playX = costX + iconSize * 1.4 + costWidth;
    drawPlayIcon(ctx, playX, centerY, iconSize);
    ctx.fillText(String(act), playX + iconSize * 0.7, centerY + 4 * scale);

    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statsRight = safeX + safeW - 24 * scale;
    drawStatPill(ctx, statsRight - 82 * scale, centerY - 16 * scale, 36 * scale, 32 * scale, '#ef4444', '\u2694', atkToShow, scale);
    drawStatPill(ctx, statsRight - 40 * scale, centerY - 16 * scale, 36 * scale, 32 * scale, '#22c55e', '\u2764', hpToShow, scale);
  } else {
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.textAlign = 'right';
    ctx.font = `${Math.max(9, Math.round(11 * scale))}px "Source Sans Pro", system-ui`;
    ctx.fillText('Instant effect', safeX + safeW - 28 * scale, centerY + 4 * scale);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return; const words = text.split(' '); let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trimEnd(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trimEnd(), x, y);
}

function getElementColor(element) {
  const colors = { FIRE: '#dc2626', WATER: '#0369a1', EARTH: '#525252', FOREST: '#166534', BIOLITH: '#64748b', NEUTRAL: '#94a3b8' };
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

function drawRoundedFrame(ctx, x, y, w, h, r, strokeStyle) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null) {
  ctx.save();
  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.stroke();
  }
  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(4, r);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawElementBadge(ctx, x, y, size, element, emoji) {
  const radius = size / 2;
  const color = getElementColor(element);
  const gradient = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.4, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, shadeColor(color, -40));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.65)';
  ctx.lineWidth = Math.max(1, radius * 0.18);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#f8fafc';
  ctx.font = `${Math.max(8, Math.round(size * 0.55))}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(emoji || element?.[0] || '', x, y + size * 0.22);
}

function drawCostBadge(ctx, x, y, size, cost, locked) {
  const radius = size / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.4)';
  ctx.lineWidth = Math.max(1, radius * 0.18);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.max(8, Math.round(size * 0.6))}px "Source Sans Pro", system-ui`;
  ctx.fillText(String(cost), x, y + size * 0.22);
  if (locked) {
    drawLockIcon(ctx, x + radius * 1.2, y, size * 0.55);
  }
}

function drawStatPill(ctx, x, y, w, h, color, symbol, value, scale) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 ${Math.max(10, Math.round(12 * scale))}px "Source Sans Pro", system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(symbol, x + w * 0.3, y + h * 0.65);
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${Math.max(12, Math.round(16 * scale))}px "Source Sans Pro", system-ui`;
  ctx.fillText(String(value), x + w * 0.68, y + h * 0.68);
  ctx.restore();
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 0 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 0 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 0 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// Рисуем иконку play (треугольник)
function drawPlayIcon(ctx, x, y, size) {
  const r = size / 2;
  ctx.fillStyle = '#38bdf8';
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
  // базовая сетка
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      if (r === 1 && c === 1) ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(cx, cy, cell, cell);
    }
  }

  // Для магической атаки подсвечиваем все клетки поля,
  // а красной рамкой обозначаем только клетку спереди.
  if (cardData.attackType === 'MAGIC') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue; // центр — сам атакующий
        const cx = x + c * (cell + gap);
        const cy = y + r * (cell + gap);
        ctx.fillStyle = 'rgba(56,189,248,0.35)';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = 'rgba(56,189,248,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      }
    }
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
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
      // заливаем все потенциальные клетки (включая выходящие за 3x3)
      ctx.fillStyle = 'rgba(56,189,248,0.35)';
      ctx.fillRect(cx, cy, cell, cell);
      // если атака охватывает несколько дистанций одновременно, подсвечиваем все
      const multi = (!a.mode || a.mode !== 'ANY') && (a.ranges && a.ranges.length > 1);
      const mustHit = (!isChoice) && (multi || dist === minDist);
      ctx.strokeStyle = mustHit ? '#ef4444' : 'rgba(56,189,248,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }
  // Подсветка клетки перед существом при выборе направления
  if (cardData.chooseDir || attacks.some(a => a.mode === 'ANY')) {
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  }
}

function drawBlindspotGrid(ctx, cardData, x, y, cell, gap) {
  const blind = (cardData.blindspots && cardData.blindspots.length) ? cardData.blindspots : ['S'];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap); const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(148,163,184,0.35)'; if (r === 1 && c === 1) ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.fillRect(cx, cy, cell, cell);
      const isN = (r === 0 && c === 1), isE = (r === 1 && c === 2), isS = (r === 2 && c === 1), isW = (r === 1 && c === 0);
      if ((isN && blind.includes('N')) || (isE && blind.includes('E')) || (isS && blind.includes('S')) || (isW && blind.includes('W'))) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.strokeRect(cx+0.5, cy+0.5, cell-1, cell-1);
      }
    }
  }
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
try {
  if (typeof window !== 'undefined') {
    window.__cards = {
      getCachedTexture,
      preloadCardTextures,
      createCard3D,
      drawCardFace,
      subscribeCardFaceUpdates,
      CARD_TEX,
      CARD_IMAGES,
    };
  }
} catch {}

