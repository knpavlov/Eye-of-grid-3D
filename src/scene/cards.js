// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

// Базовый размер новой карточной рамки и ключевые зоны разметки
const CARD_BASE_SIZE = { width: 832, height: 1248 };
const CARD_LAYOUT = {
  nameY: 252,
  typeY: 312,
  namePadding: 240,
  illustration: {
    x: 128,
    y: 332,
    width: CARD_BASE_SIZE.width - 256,
    height: 536,
  },
  text: {
    left: 128,
    width: CARD_BASE_SIZE.width - 256,
    gapAbove: 56,
  },
  bottomReserved: 236,
  diagrams: {
    cell: 78,
    gap: 8,
    spacing: 60,
    labelGap: 34,
    gapAbove: 52,
    minTopAfterArt: 48,
  },
  summonOrb: { cx: 176, cy: 174, radius: 158, font: 248 },
  activationOrb: { cx: 316, cy: 116, radius: 74, font: 132 },
  hpCrystal: { cx: 232, cy: 1144, font: 168 },
  atkCrystal: { cx: CARD_BASE_SIZE.width - 232, cy: 1144, font: 168 },
  lockBadge: { cx: 364, cy: 214, size: 70 },
};

function createScaleHelpers(width, height) {
  const scaleX = width / CARD_BASE_SIZE.width;
  const scaleY = height / CARD_BASE_SIZE.height;
  const scale = (scaleX + scaleY) / 2;
  const px = (val) => Math.round(val * scaleX);
  const py = (val) => Math.round(val * scaleY);
  const sx = (val) => Math.max(1, Math.round(val * scaleX));
  const sy = (val) => Math.max(1, Math.round(val * scaleY));
  const ps = (val) => Math.max(1, Math.round(val * scale));
  return { scaleX, scaleY, scale, px, py, ps, sx, sy };
}

function getIllustrationRect(width, height) {
  const { px, py, sx, sy } = createScaleHelpers(width, height);
  const ill = CARD_LAYOUT.illustration;
  return {
    x: px(ill.x),
    y: py(ill.y),
    width: sx(ill.width),
    height: sy(ill.height),
  };
}

function drawBadgeValue(ctx, text, centerX, centerY, {
  fontSize,
  minFontSize,
  maxWidth,
  fontFamily = '"Cinzel", "Times New Roman", serif',
  fontWeight = '700',
  fillStyle = '#f8fafc',
  strokeStyle = null,
  strokeWidth = null,
  shadowColor = null,
  shadowBlur = 0,
  shadowOffsetX = 0,
  shadowOffsetY = 0,
} = {}) {
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.max(1, fontSize || 12);
  const minSize = Math.max(1, minFontSize || Math.round(size * 0.6));
  while (size > minSize) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    if (!maxWidth || ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.font = `${fontWeight} ${Math.max(size, minSize)}px ${fontFamily}`;
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
  }
  if (strokeStyle) {
    ctx.lineWidth = strokeWidth || Math.max(1, Math.round(size * 0.12));
    ctx.strokeStyle = strokeStyle;
    try { ctx.strokeText(text, centerX, centerY); } catch {}
  }
  ctx.fillStyle = fillStyle;
  try { ctx.fillText(text, centerX, centerY); } catch {}
  ctx.restore();
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

export function drawCardFace(ctx, cardData, width, height, hpOverride = null, atkOverride = null, opts = {}) {
  const THREE = getTHREE();
  const helpers = createScaleHelpers(width, height);
  const { px, py, ps } = helpers;

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

  const border = Math.max(2, ps(6));
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = getElementColor(cardData.element);
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, width - border, height - border);
  ctx.restore();

  const elementLabels = { FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', FOREST: 'Forest', BIOLITH: 'Biolith', NEUTRAL: 'Neutral' };

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  let displayName = (cardData.name || '').trim();
  if (displayName.length > 40) displayName = displayName.slice(0, 40) + '…';
  let nameFont = Math.max(ps(41), 24);
  const minNameFont = Math.max(ps(32), 18);
  const nameMaxWidth = width - Math.max(px(CARD_LAYOUT.namePadding), Math.round(width * 0.24));
  while (nameFont > minNameFont) {
    ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
    if (ctx.measureText(displayName).width <= nameMaxWidth) break;
    nameFont -= 1;
  }
  ctx.font = `600 ${Math.max(nameFont, minNameFont)}px "Cinzel", "Times New Roman", serif`;
  ctx.lineWidth = Math.max(ps(4), 2);
  ctx.strokeStyle = 'rgba(8,15,32,0.65)';
  try { ctx.strokeText(displayName, width / 2, py(CARD_LAYOUT.nameY)); } catch {}
  ctx.fillText(displayName, width / 2, py(CARD_LAYOUT.nameY));
  ctx.restore();

  const typeParts = [];
  const elementLabel = elementLabels[cardData.element] || elementLabels.NEUTRAL;
  if (elementLabel) typeParts.push(elementLabel);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  if (typeLine) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.max(ps(26), 12)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.lineWidth = Math.max(ps(2), 1);
    ctx.strokeStyle = 'rgba(15,23,42,0.6)';
    ctx.fillStyle = 'rgba(226,232,240,0.82)';
    const typeY = py(CARD_LAYOUT.typeY);
    try { ctx.strokeText(typeLine, width / 2, typeY); } catch {}
    ctx.fillText(typeLine, width / 2, typeY);
    ctx.restore();
  }

  const illRect = getIllustrationRect(width, height);
  ctx.save();
  ctx.fillStyle = 'rgba(8, 15, 32, 0.55)';
  ctx.fillRect(illRect.x, illRect.y, illRect.width, illRect.height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = Math.max(1, ps(2));
  ctx.strokeRect(illRect.x, illRect.y, illRect.width, illRect.height);
  ctx.restore();

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
    let w = illRect.width, h = illRect.height;
    if (w / h > ar) { w = h * ar; } else { h = w / ar; }
    const dx = illRect.x + (illRect.width - w) / 2;
    const dy = illRect.y + (illRect.height - h) / 2;
    try { ctx.drawImage(img, dx, dy, w, h); } catch {}
  } else {
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.max(ps(26), 12)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillText('Illustration', illRect.x + illRect.width / 2, illRect.y + Math.round(illRect.height / 2));
    ctx.restore();
  }

  const text = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  ctx.save();
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${Math.max(ps(34), 12)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textX = px(CARD_LAYOUT.text.left);
  const textY = illRect.y + illRect.height + py(CARD_LAYOUT.text.gapAbove);
  const textWidth = Math.max(px(CARD_LAYOUT.text.width), width - textX - Math.max(px(80), 24));
  const bottomReserved = Math.max(py(CARD_LAYOUT.bottomReserved), Math.round(height * 0.18));
  let textMaxY = Math.max(textY, height - bottomReserved);
  let diagramTop = null;
  let diagramCell = null;
  let diagramGap = null;
  let diagramLabelGap = null;
  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.cell)), 6);
    diagramGap = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.gap)), 1);
    diagramLabelGap = Math.max(py(CARD_LAYOUT.diagrams.labelGap), Math.round(diagramCell * 0.6));
    const diagramHeight = diagramCell * 3 + diagramGap * 2;
    const minDiagramTop = illRect.y + illRect.height + Math.max(py(CARD_LAYOUT.diagrams.minTopAfterArt), Math.round(diagramCell * 0.5));
    diagramTop = Math.max(minDiagramTop, height - bottomReserved - diagramHeight);
    const gapAbove = Math.max(py(CARD_LAYOUT.diagrams.gapAbove), Math.round(diagramCell * 0.7));
    textMaxY = Math.max(textY, diagramTop - gapAbove);
  }
  wrapText(ctx, text, textX, textY, textWidth, Math.max(ps(38), 16), textMaxY);
  ctx.restore();

  if (diagramTop != null && diagramCell != null && diagramGap != null) {
    const gridW = diagramCell * 3 + diagramGap * 2;
    const spacing = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.spacing)), Math.round(diagramCell * 0.9));
    const schemes = getAttackSchemes(cardData);
    const schemeCount = schemes.length;
    const totalWidth = gridW * (schemeCount + 1) + spacing * schemeCount;
    const startX = Math.round((width - totalWidth) / 2);
    const gridY = diagramTop;
    const gridHeight = diagramCell * 3 + diagramGap * 2;
    schemes.forEach((scheme, idx) => {
      const gridX = startX + idx * (gridW + spacing);
      drawAttackScheme(ctx, scheme, cardData, gridX, gridY, diagramCell, diagramGap);
      const labelRaw = scheme.label ?? (schemeCount > 1 ? (idx === 0 ? 'Base' : (idx === 1 ? 'Alt' : `Alt ${idx}`)) : '');
      if (labelRaw) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `600 ${Math.max(ps(26), 12)}px "Noto Sans", "Helvetica", sans-serif`;
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = 'rgba(15,23,42,0.6)';
        ctx.lineWidth = Math.max(ps(2), 1);
        const labelY = gridY + gridHeight + diagramLabelGap;
        try { ctx.strokeText(labelRaw, gridX + gridW / 2, labelY); } catch {}
        ctx.fillText(labelRaw, gridX + gridW / 2, labelY);
        ctx.restore();
      }
    });
    const blindspotX = startX + schemeCount * (gridW + spacing);
    drawBlindspotGrid(ctx, cardData, blindspotX, gridY, diagramCell, diagramGap);
  }

  const summonCenterX = px(CARD_LAYOUT.summonOrb.cx);
  const summonCenterY = py(CARD_LAYOUT.summonOrb.cy);
  const summonRadius = ps(CARD_LAYOUT.summonOrb.radius);
  drawBadgeValue(ctx, String(cardData.cost ?? 0), summonCenterX, summonCenterY, {
    fontSize: Math.max(ps(CARD_LAYOUT.summonOrb.font), 18),
    minFontSize: Math.max(ps(150), 14),
    maxWidth: summonRadius * 1.7,
    fillStyle: '#e0f2fe',
    strokeStyle: 'rgba(8,15,32,0.65)',
    strokeWidth: Math.max(ps(8), 3),
    shadowColor: 'rgba(8,15,32,0.55)',
    shadowBlur: Math.max(ps(14), 4),
    shadowOffsetY: Math.max(ps(2), 1),
  });

  if (cardData.locked) {
    const lockSize = Math.max(ps(CARD_LAYOUT.lockBadge.size), 12);
    drawLockIcon(ctx, px(CARD_LAYOUT.lockBadge.cx), py(CARD_LAYOUT.lockBadge.cy), lockSize);
  }

  if (cardData.type === 'UNIT') {
    const activationOverride = (opts && Object.prototype.hasOwnProperty.call(opts, 'activationOverride'))
      ? opts.activationOverride
      : ((opts && Object.prototype.hasOwnProperty.call(opts, 'activation')) ? opts.activation : null);
    const actBase = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const act = (activationOverride != null) ? activationOverride : actBase;
    const activationRadius = ps(CARD_LAYOUT.activationOrb.radius);
    drawBadgeValue(ctx, String(act), px(CARD_LAYOUT.activationOrb.cx), py(CARD_LAYOUT.activationOrb.cy), {
      fontSize: Math.max(ps(CARD_LAYOUT.activationOrb.font), 14),
      minFontSize: Math.max(ps(84), 10),
      maxWidth: activationRadius * 1.6,
      fontFamily: '"Noto Sans", "Helvetica", sans-serif',
      strokeStyle: 'rgba(12,20,38,0.7)',
      strokeWidth: Math.max(ps(5), 2),
      shadowColor: 'rgba(8,15,32,0.45)',
      shadowBlur: Math.max(ps(10), 3),
      shadowOffsetY: Math.max(ps(2), 1),
    });

    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statFontSize = Math.max(ps(CARD_LAYOUT.hpCrystal.font), 16);
    const statMaxWidth = statFontSize * 1.6;
    const statOptions = {
      fontSize: statFontSize,
      minFontSize: Math.max(ps(96), 12),
      maxWidth: statMaxWidth,
      fillStyle: '#f8fafc',
      strokeStyle: 'rgba(15,23,42,0.75)',
      strokeWidth: Math.max(ps(6), 2),
      shadowColor: 'rgba(15,23,42,0.45)',
      shadowBlur: Math.max(ps(12), 3),
      shadowOffsetY: Math.max(ps(2), 1),
    };
    drawBadgeValue(ctx, String(hpToShow), px(CARD_LAYOUT.hpCrystal.cx), py(CARD_LAYOUT.hpCrystal.cy), statOptions);
    drawBadgeValue(ctx, String(atkToShow), px(CARD_LAYOUT.atkCrystal.cx), py(CARD_LAYOUT.atkCrystal.cy), statOptions);
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
  const colors = { FIRE: '#dc2626', WATER: '#0369a1', EARTH: '#525252', FOREST: '#166534', BIOLITH: '#64748b' };
  return colors[element] || '#64748b';
}

// Рисуем иконку орба маны
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

function drawAttackScheme(ctx, scheme, cardData, x, y, cell, gap) {
  const attacks = scheme.attacks || [];
  const attackType = scheme.attackType || cardData.attackType || 'STANDARD';
  const chooseDir = scheme.chooseDir ?? cardData.chooseDir ?? false;
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

  if (attackType === 'MAGIC') {
    const area = scheme.magicArea || scheme.magicAttackArea || cardData.magicAttackArea;
    if (area === 'CROSS') {
      const dirs = [ [0,0], [-1,0], [1,0], [0,-1], [0,1] ];
      for (const [dr, dc] of dirs) {
        const rr = 1 + dr;
        const cc = 1 + dc;
        if (rr < 0 || rr > 2 || cc < 0 || cc > 2) continue;
        const cx = x + cc * (cell + gap);
        const cy = y + rr * (cell + gap);
        ctx.fillStyle = 'rgba(147,197,253,0.28)';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = accentLine;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      }
    } else {
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
    }
    return;
  }

  const map = { N: [-1,0], E:[0,1], S:[1,0], W:[0,-1] };
  const outerMarks = [];
  for (const a of attacks) {
    const isChoice = chooseDir || a.mode === 'ANY';
    const ranges = Array.isArray(a.ranges) && a.ranges.length ? a.ranges : [1];
    const minDist = Math.min(...ranges);
    for (const dist of ranges) {
      const vec = map[a.dir];
      if (!vec) continue;
      const rr = 1 + vec[0] * dist;
      const cc = 1 + vec[1] * dist;
      const multi = (!a.mode || a.mode !== 'ANY') && ranges.length > 1;
      const mustHit = (!isChoice) && (multi || dist === minDist);
      if (rr < 0 || rr > 2 || cc < 0 || cc > 2) {
        outerMarks.push({ rr, cc, mustHit });
        continue;
      }
      const cx = x + cc * (cell + gap);
      const cy = y + rr * (cell + gap);
      ctx.fillStyle = 'rgba(56,189,248,0.28)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = mustHit ? '#ef4444' : 'rgba(56,189,248,0.65)';
      ctx.lineWidth = accentLine;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }

  for (const mark of outerMarks) {
    const cx = x + mark.cc * (cell + gap);
    const cy = y + mark.rr * (cell + gap);
    ctx.fillStyle = 'rgba(56,189,248,0.16)';
    ctx.fillRect(cx, cy, cell, cell);
    ctx.strokeStyle = mark.mustHit ? '#ef4444' : 'rgba(56,189,248,0.75)';
    ctx.lineWidth = accentLine;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  }

  if (chooseDir || attacks.some(a => a.mode === 'ANY')) {
    let firstHighlight = null;
    for (const a of attacks) {
      const vec = map[a.dir];
      if (!vec) continue;
      const ranges = Array.isArray(a.ranges) && a.ranges.length
        ? a.ranges.map(v => Math.max(1, Math.floor(Number(v)))).filter(Boolean)
        : [1];
      if (!ranges.length) continue;
      const minDist = Math.min(...ranges);
      const rr = 1 + vec[0] * minDist;
      const cc = 1 + vec[1] * minDist;
      if (rr < 0 || rr > 2 || cc < 0 || cc > 2) continue;
      firstHighlight = { rr, cc };
      break;
    }
    const mark = firstHighlight || { rr: 0, cc: 1 };
    const cx = x + mark.cc * (cell + gap);
    const cy = y + mark.rr * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = accentLine;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  }
}

function getAttackSchemes(cardData) {
  if (!cardData || cardData.type !== 'UNIT') return [];
  if (Array.isArray(cardData.attackSchemes) && cardData.attackSchemes.length) {
    return cardData.attackSchemes.map((scheme, idx) => ({
      key: scheme.key || `scheme-${idx}`,
      label: scheme.label,
      attackType: scheme.attackType || cardData.attackType,
      attacks: scheme.attacks || [],
      chooseDir: scheme.chooseDir,
      magicArea: scheme.magicArea || scheme.magicAttackArea,
    }));
  }
  return [{
    key: 'default',
    label: null,
    attackType: cardData.attackType,
    attacks: cardData.attacks || [],
    chooseDir: cardData.chooseDir,
    magicArea: cardData.magicAttackArea,
  }];
}

function drawBlindspotGrid(ctx, cardData, x, y, cell, gap) {
  const hasExplicitBlind = Object.prototype.hasOwnProperty.call(cardData, 'blindspots');
  // Если массив задан явно, даже пустой, то у карты нет слепых зон
  const blind = hasExplicitBlind
    ? (Array.isArray(cardData.blindspots) ? cardData.blindspots : [])
    : ['S'];
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

function attachIllustrationPlane(cardMesh, cardData) {
  const THREE = getTHREE();
  if (!cardMesh || !cardData) return;
  const prev = cardMesh.children?.find(ch => ch.userData && ch.userData.kind === 'illustrationPlane');
  if (prev) { try { cardMesh.remove(prev); } catch {} }
  const img = CARD_IMAGES[cardData.id] || CARD_IMAGES[cardData.id?.toLowerCase?.()] || CARD_IMAGES[(cardData.name||'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').replace(/\s+/g,'_')];
  const W = 256, H = 356;
  const illRect = getIllustrationRect(W, H);
  const illX = illRect.x;
  const illY = illRect.y;
  const illW = illRect.width;
  const illH = illRect.height;
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

