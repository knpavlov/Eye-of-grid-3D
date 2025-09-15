// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

const ELEMENT_BADGE_META = {
  FIRE:    { title: 'Fire', badge: 'F', gradient: ['#fee2e2', '#b91c1c'] },
  WATER:   { title: 'Water', badge: 'W', gradient: ['#bfdbfe', '#0369a1'] },
  EARTH:   { title: 'Earth', badge: 'E', gradient: ['#e5e7eb', '#4b5563'] },
  FOREST:  { title: 'Forest', badge: 'F', gradient: ['#bbf7d0', '#166534'] },
  BIOLITH: { title: 'Biolith', badge: 'B', gradient: ['#e2e8f0', '#6b7280'] },
  NEUTRAL: { title: 'Neutral', badge: 'N', gradient: ['#e2e8f0', '#475569'] },
};

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
  getTHREE();
  const BASE_W = 256;
  const BASE_H = 356;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  const scaleX = width / BASE_W;
  const scaleY = height / BASE_H;
  ctx.scale(scaleX, scaleY);

  let imgFront = null;
  try {
    imgFront = CARD_TEX.front && CARD_TEX.front.image && CARD_TEX.front.image.width ? CARD_TEX.front.image : null;
  } catch {}
  if (imgFront) {
    try { ctx.drawImage(imgFront, 0, 0, BASE_W, BASE_H); } catch {}
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, BASE_H);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }
  ctx.fillStyle = 'rgba(15,23,42,0.18)';
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  const elementMeta = ELEMENT_BADGE_META[cardData.element] || ELEMENT_BADGE_META.NEUTRAL;
  const elementEmoji = (typeof window !== 'undefined' && window.elementEmoji) || {};
  const badgeSymbol = elementEmoji[cardData.element] || elementMeta.badge;

  const frameInset = 10;
  ctx.strokeStyle = getElementColor(cardData.element);
  ctx.lineWidth = 5;
  ctx.strokeRect(frameInset, frameInset, BASE_W - frameInset * 2, BASE_H - frameInset * 2);

  const nameArea = { x: 24, y: 18, w: BASE_W - 48, h: 24 };
  drawPanel(ctx, nameArea.x, nameArea.y, nameArea.w, nameArea.h, 8, 'rgba(15,23,42,0.82)', 'rgba(148,163,184,0.35)', 1.1);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayName = fitTextToWidth(ctx, cardData.name || '', nameArea.w - 16);
  ctx.fillText(displayName, BASE_W / 2, nameArea.y + nameArea.h / 2 + 0.5);

  const badgeRadius = 14;
  const badgeX = nameArea.x + badgeRadius;
  const badgeY = nameArea.y + nameArea.h + 16;
  drawElementBadge(ctx, badgeX, badgeY, badgeRadius, elementMeta, badgeSymbol);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(226,232,240,0.85)';
  ctx.font = '600 9px "Segoe UI", sans-serif';
  ctx.fillText(elementMeta.title.toUpperCase(), badgeX + badgeRadius + 10, badgeY + 3);

  const artRect = { x: 22, y: badgeY + badgeRadius + 6, w: BASE_W - 44, h: 128 };
  drawPanel(ctx, artRect.x, artRect.y, artRect.w, artRect.h, 12, 'rgba(15,23,42,0.32)', 'rgba(226,232,240,0.28)', 1);
  const artClip = { x: artRect.x + 6, y: artRect.y + 6, w: artRect.w - 12, h: artRect.h - 12 };
  drawCardIllustration(ctx, cardData, artClip.x, artClip.y, artClip.w, artClip.h);

  const typeLabel = (cardData.type === 'UNIT' ? 'Creature' : 'Spell').toUpperCase();
  drawPanel(ctx, artRect.x + 18, artRect.y + artRect.h - 18, artRect.w - 36, 20, 10, 'rgba(15,23,42,0.78)', 'rgba(148,163,184,0.25)', 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#facc15';
  ctx.font = '700 10px "Segoe UI", sans-serif';
  ctx.fillText(typeLabel, BASE_W / 2, artRect.y + artRect.h - 8);

  let sectionTop = artRect.y + artRect.h + 12;

  if (cardData.type === 'UNIT') {
    const gridCell = 11;
    const gridGap = 2;
    const gridHeight = gridCell * 3 + gridGap * 2;
    const gridX = artRect.x + 8;
    const gridY = sectionTop;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 8px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.fillText('ATTACK PATTERN', gridX + (gridHeight / 2), gridY - 6);
    ctx.fillText('BLIND SPOTS', gridX + gridHeight + 26 + (gridHeight / 2), gridY - 6);
    drawAttacksGrid(ctx, cardData, gridX, gridY, gridCell, gridGap);
    drawBlindspotGrid(ctx, cardData, gridX + gridHeight + 26, gridY, gridCell, gridGap);
    sectionTop = gridY + gridHeight + 10;
  }

  const textRect = { x: 22, y: sectionTop, w: BASE_W - 44, h: 64 };
  drawPanel(ctx, textRect.x, textRect.y, textRect.w, textRect.h, 12, 'rgba(15,23,42,0.82)', 'rgba(148,163,184,0.28)', 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.font = '700 9px "Segoe UI", sans-serif';
  ctx.fillText(typeLabel, textRect.x + 12, textRect.y + 16);
  ctx.font = '500 10px "Segoe UI", sans-serif';
  const rulesText = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  wrapText(ctx, rulesText, textRect.x + 12, textRect.y + 30, textRect.w - 24, 12, textRect.y + textRect.h - 8);

  const statsRect = { x: 20, y: textRect.y + textRect.h + 10, w: BASE_W - 40, h: 28 };
  drawPanel(ctx, statsRect.x, statsRect.y, statsRect.w, statsRect.h, 14, 'rgba(15,23,42,0.88)', 'rgba(148,163,184,0.28)', 1);
  const statsCenterY = statsRect.y + statsRect.h / 2;
  const costOrbSize = 18;
  const costCenterX = statsRect.x + 16;
  drawManaOrbIcon(ctx, costCenterX, statsCenterY, costOrbSize);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 11px "Segoe UI", sans-serif';
  const costText = String(cardData.cost ?? 0);
  ctx.fillText(costText, costCenterX + costOrbSize / 2 + 6, statsCenterY + 4);
  let cursorX = costCenterX + costOrbSize / 2 + 6 + ctx.measureText(costText).width;
  if (cardData.locked) {
    const lockSize = 14;
    cursorX += lockSize / 2 + 6;
    drawLockIcon(ctx, cursorX, statsCenterY, lockSize);
    cursorX += lockSize / 2 + 4;
  }
  if (cardData.type === 'UNIT') {
    const actValue = cardData.activation != null ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const playSize = 14;
    cursorX += playSize / 2 + 8;
    drawPlayIcon(ctx, cursorX, statsCenterY, playSize);
    cursorX += playSize / 2 + 6;
    ctx.fillText(String(actValue), cursorX, statsCenterY + 3);
    ctx.textAlign = 'right';
    ctx.font = '700 12px "Segoe UI", sans-serif';
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statsLabel = `\u2694 ${atkToShow}   \u2764 ${hpToShow}`;
    ctx.fillText(statsLabel, statsRect.x + statsRect.w - 12, statsCenterY + 4);
  }

  ctx.restore();
}

function drawCardIllustration(ctx, cardData, x, y, width, height) {
  const img = resolveCardImage(cardData);
  ctx.save();
  pathRoundedRect(ctx, x, y, width, height, 10);
  ctx.clip();
  if (img && img.complete && !(typeof location !== 'undefined' && location.protocol === 'file:')) {
    const ar = img.width / img.height;
    let drawW = width;
    let drawH = height;
    if (drawW / drawH > ar) { drawW = drawH * ar; } else { drawH = drawW / ar; }
    const dx = x + (width - drawW) / 2;
    const dy = y + (height - drawH) / 2;
    try { ctx.drawImage(img, dx, dy, drawW, drawH); } catch {}
  } else {
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, 'rgba(148,163,184,0.25)');
    gradient.addColorStop(1, 'rgba(71,85,105,0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ART LOADING', x + width / 2, y + height / 2);
  }
  ctx.restore();
}

function resolveCardImage(cardData) {
  if (!cardData) return null;
  if (typeof Image === 'undefined') return null;
  const nameSlug = (cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').trim();
  const variants = [];
  if (cardData.id) variants.push(cardData.id);
  if (typeof cardData.id === 'string') variants.push(cardData.id.toLowerCase());
  if (nameSlug) {
    variants.push(nameSlug.replace(/\s+/g, '_'));
    variants.push(nameSlug.replace(/\s+/g, '-'));
  }
  const keys = [...new Set(variants.filter(Boolean))];
  for (const key of keys) {
    if (CARD_IMAGES[key]) return CARD_IMAGES[key];
  }
  const pendingKey = cardData.id || keys[0];
  if (pendingKey && !CARD_PENDING[pendingKey]) {
    CARD_PENDING[pendingKey] = true;
    const candidates = keys.map(k => `card images/${k}.png`).filter(Boolean);
    if (cardData.id && !candidates.includes(`card images/${cardData.id}.png`)) {
      candidates.unshift(`card images/${cardData.id}.png`);
    }
    (function tryLoad(i) {
      if (i >= candidates.length) { CARD_PENDING[pendingKey] = false; return; }
      const im = new Image();
      im.onload = () => {
        const registerKeys = [...new Set([...keys, cardData.id].filter(Boolean))];
        registerKeys.forEach(k => { CARD_IMAGES[k] = im; });
        CARD_PENDING[pendingKey] = false;
        try { if (typeof window !== 'undefined' && typeof window.requestCardsRedraw === 'function') window.requestCardsRedraw(); } catch {}
      };
      im.onerror = () => tryLoad(i + 1);
      im.src = encodeURI(candidates[i]);
    })(0);
  }
  return null;
}

function drawPanel(ctx, x, y, width, height, radius, fillStyle, strokeStyle, strokeWidth = 1) {
  pathRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function pathRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitTextToWidth(ctx, text, maxWidth) {
  if (!text) return '';
  let current = text.trim();
  if (!current) return '';
  if (ctx.measureText(current).width <= maxWidth) return current;
  while (current.length > 0 && ctx.measureText(`${current}...`).width > maxWidth) {
    current = current.slice(0, -1);
  }
  return current.length ? `${current}...` : text.slice(0, 1);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxY = Infinity) {
  if (!text) return;
  const words = text.split(/\s+/);
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      if (y > maxY) return;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && y <= maxY) ctx.fillText(line, x, y);
}

function drawElementBadge(ctx, x, y, radius, meta, symbol) {
  const gradient = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.6, radius * 0.2, x, y, radius);
  const [inner, outer] = meta.gradient || ['#e2e8f0', '#475569'];
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.55, inner);
  gradient.addColorStop(1, outer);
  ctx.beginPath();
  ctx.fillStyle = gradient;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(15,23,42,0.7)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.font = `600 ${Math.round(radius * 1.2)}px "Segoe UI Emoji", "Segoe UI", sans-serif`;
  ctx.fillText(symbol, x, y + 0.5);
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
  // базовая сетка
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(30,41,59,0.7)';
      if (r === 1 && c === 1) ctx.fillStyle = 'rgba(15,23,42,0.95)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx + 0.3, cy + 0.3, cell - 0.6, cell - 0.6);
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
        ctx.strokeStyle = 'rgba(56,189,248,0.65)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx + 0.4, cy + 0.4, cell - 0.8, cell - 0.8);
      }
    }
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx + 0.4, cy + 0.4, cell - 0.8, cell - 0.8);
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
      ctx.strokeStyle = mustHit ? '#ef4444' : 'rgba(56,189,248,0.65)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx + 0.4, cy + 0.4, cell - 0.8, cell - 0.8);
    }
  }
  // Подсветка клетки перед существом при выборе направления
  if (cardData.chooseDir || attacks.some(a => a.mode === 'ANY')) {
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx + 0.4, cy + 0.4, cell - 0.8, cell - 0.8);
  }
}

function drawBlindspotGrid(ctx, cardData, x, y, cell, gap) {
  const blind = (cardData.blindspots && cardData.blindspots.length) ? cardData.blindspots : ['S'];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap); const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(30,41,59,0.7)';
      if (r === 1 && c === 1) ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx + 0.3, cy + 0.3, cell - 0.6, cell - 0.6);
      const isN = (r === 0 && c === 1), isE = (r === 1 && c === 2), isS = (r === 2 && c === 1), isW = (r === 1 && c === 0);
      if ((isN && blind.includes('N')) || (isE && blind.includes('E')) || (isS && blind.includes('S')) || (isW && blind.includes('W'))) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.2; ctx.strokeRect(cx+0.4, cy+0.4, cell-0.8, cell-0.8);
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
try { if (typeof window !== 'undefined') { window.__cards = { getCachedTexture, preloadCardTextures, createCard3D, drawCardFace, CARD_TEX, CARD_IMAGES }; } } catch {}

