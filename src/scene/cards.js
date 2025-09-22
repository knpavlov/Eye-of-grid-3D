// Card meshes и текстуры
import { getCtx } from './context.js';

// Структура текстур: общая обложка + индивидуальные фронты для каждой стихии
const CARD_TEX = { front: null, fronts: {}, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

const FRONT_TEXTURE_PATHS = {
  FIRE: 'textures/card_front_final_fire.png',
  WATER: 'textures/card_front_final_water.png',
  EARTH: 'textures/card_front_final_earth.png',
  FOREST: 'textures/card_front_final_forest.png',
  BIOLITH: 'textures/card_front_final_biolith.png',
  NEUTRAL: 'textures/card_front_final_biolith.png'
};

const CARD_LAYOUT = {
  baseWidth: 832,
  baseHeight: 1248,
  summonOrb: {
    centerX: 235,
    centerY: 108,
    radiusX: 132,
    radiusY: 86,
    baseFont: 180,
    minFont: 120
  },
  activationOrb: {
    centerX: 693,
    centerY: 108,
    radiusX: 128,
    radiusY: 80,
    baseFont: 120,
    minFont: 84
  },
  hpCrystal: {
    centerX: 66,
    centerY: 1136,
    radiusX: 30,
    radiusY: 78,
    baseFont: 108,
    minFont: 74
  },
  atkCrystal: {
    centerX: 748,
    centerY: 1134,
    radiusX: 96,
    radiusY: 96,
    baseFont: 112,
    minFont: 82
  },
  nameLine: {
    y: 226,
    marginX: 180,
    baseFont: 60,
    minFont: 44
  },
  typeLine: {
    y: 276,
    baseFont: 34
  },
  illustration: {
    x: 96,
    y: 298,
    width: 640,
    height: 548
  },
  text: {
    marginX: 148,
    gapAbove: 40,
    bottomReserved: 240,
    baseFont: 32,
    lineHeight: 36
  },
  diagrams: {
    spacing: 44,
    cell: 26,
    gap: 4,
    horizontalSpacing: 64,
    bottomLimit: 1010
  },
  lock: {
    centerX: 456,
    centerY: 152,
    size: 60
  }
};

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE not available');
  return THREE;
}

function getFrontTexture(element) {
  if (!element) return CARD_TEX.front;
  const key = String(element).toUpperCase();
  return CARD_TEX.fronts[key] || CARD_TEX.fronts.BIOLITH || CARD_TEX.fronts.NEUTRAL || CARD_TEX.front;
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
    const loadedFronts = {};
    for (const [element, url] of Object.entries(FRONT_TEXTURE_PATHS)) {
      loadedFronts[element] = getCachedTexture(url);
    }
    CARD_TEX.fronts = loadedFronts;
    CARD_TEX.front = loadedFronts.BIOLITH || loadedFronts.NEUTRAL || null;
    CARD_TEX.back     = getCachedTexture('textures/card_back_main.jpeg');
    CARD_TEX.deckSide = getCachedTexture('textures/card_deck_side_view.jpeg');
  } catch {}
  try { if (typeof window !== 'undefined') window.CARD_TEX = CARD_TEX; } catch {}
}

export function drawCardFace(ctx, cardData, width, height, hpOverride = null, atkOverride = null, opts = {}) {
  const THREE = getTHREE();
  const BASE_W = CARD_LAYOUT.baseWidth;
  const BASE_H = CARD_LAYOUT.baseHeight;
  const scaleX = width / BASE_W;
  const scaleY = height / BASE_H;
  const scale = (scaleX + scaleY) / 2;
  const px = (val) => Math.round(val * scaleX);
  const py = (val) => Math.round(val * scaleY);
  const ps = (val) => Math.max(1, Math.round(val * scale));

  // Фон карты (текстура или мягкий градиент в качестве запасного варианта)
  try {
    const frontTex = getFrontTexture(cardData.element);
    const imgFront = frontTex && frontTex.image ? frontTex.image : null;
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

  // Верхний блок: имя и короткая подпись
  const elementLabels = { FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', FOREST: 'Forest', BIOLITH: 'Biolith', NEUTRAL: 'Neutral' };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  const nameMargin = px(CARD_LAYOUT.nameLine.marginX);
  const nameMaxWidth = Math.max(0, width - nameMargin * 2);
  let displayName = (cardData.name || '').trim();
  if (displayName.length > 40) displayName = displayName.slice(0, 40) + '…';
  let nameFont = Math.max(ps(CARD_LAYOUT.nameLine.baseFont), CARD_LAYOUT.nameLine.baseFont * 0.5);
  const minNameFont = Math.max(ps(CARD_LAYOUT.nameLine.minFont), CARD_LAYOUT.nameLine.minFont * 0.5);
  while (nameFont > minNameFont) {
    ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
    if (ctx.measureText(displayName).width <= nameMaxWidth) break;
    nameFont -= 1;
  }
  ctx.font = `600 ${Math.max(nameFont, minNameFont)}px "Cinzel", "Times New Roman", serif`;
  ctx.fillText(displayName || 'Unknown', width / 2, py(CARD_LAYOUT.nameLine.y));

  const typeParts = [];
  const elementLabel = elementLabels[cardData.element] || elementLabels.NEUTRAL;
  if (elementLabel) typeParts.push(elementLabel);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  if (typeLine) {
    ctx.font = `600 ${Math.max(ps(CARD_LAYOUT.typeLine.baseFont), 12)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillStyle = 'rgba(226,232,240,0.86)';
    ctx.fillText(typeLine, width / 2, py(CARD_LAYOUT.typeLine.y));
  }

  // Рамка под иллюстрацию
  const illX = px(CARD_LAYOUT.illustration.x);
  const illY = py(CARD_LAYOUT.illustration.y);
  const illW = px(CARD_LAYOUT.illustration.width);
  const illH = py(CARD_LAYOUT.illustration.height);
  ctx.save();
  ctx.fillStyle = 'rgba(8, 15, 32, 0.58)';
  ctx.fillRect(illX, illY, illW, illH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = Math.max(1, ps(1.4));
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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textX = px(CARD_LAYOUT.text.marginX);
  const textY = illY + illH + py(CARD_LAYOUT.text.gapAbove);
  const textWidth = Math.max(0, width - textX * 2);

  const statsReservedTop = height - py(CARD_LAYOUT.text.bottomReserved);
  let diagramTop = statsReservedTop;
  let diagramCell = null;
  let diagramGap = null;

  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.cell)), 16);
    diagramGap = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.gap)), 2);
    const diagramHeight = diagramCell * 3 + diagramGap * 2;
    const diagramSpacing = Math.max(py(CARD_LAYOUT.diagrams.spacing), 18);
    diagramTop = statsReservedTop - diagramSpacing - diagramHeight;
    const diagramsBottomLimit = py(CARD_LAYOUT.diagrams.bottomLimit);
    if (diagramTop + diagramHeight > diagramsBottomLimit) diagramTop = diagramsBottomLimit - diagramHeight;
    const minDiagramTop = textY + Math.max(py(36), 24);
    if (diagramTop < minDiagramTop) diagramTop = minDiagramTop;
  }

  let textMaxY = (cardData.type === 'UNIT')
    ? diagramTop - Math.max(ps(12), 12)
    : statsReservedTop - Math.max(ps(12), 12);
  if (textMaxY < textY) textMaxY = textY;
  const textLineHeight = Math.max(ps(CARD_LAYOUT.text.lineHeight), 14);
  const textFontSize = Math.max(ps(CARD_LAYOUT.text.baseFont), 12);
  ctx.font = `500 ${textFontSize}px "Noto Sans", "Helvetica", sans-serif`;
  wrapText(ctx, text, textX, textY, textWidth, textLineHeight, textMaxY);

  if (cardData.type === 'UNIT') {
    const cell = diagramCell ?? Math.max(Math.round(ps(CARD_LAYOUT.diagrams.cell)), 16);
    const gap = diagramGap ?? Math.max(Math.round(ps(CARD_LAYOUT.diagrams.gap)), 2);
    const gridW = cell * 3 + gap * 2;
    const spacing = Math.max(Math.round(ps(CARD_LAYOUT.diagrams.horizontalSpacing)), 18);
    const schemes = getAttackSchemes(cardData);
    const schemeCount = schemes.length;
    const columns = schemeCount + 1;
    const totalWidth = gridW * columns + spacing * (columns - 1);
    const startX = (width - totalWidth) / 2;
    const gridY = diagramTop;
    const gridHeight = cell * 3 + gap * 2;
    schemes.forEach((scheme, idx) => {
      const gridX = startX + idx * (gridW + spacing);
      drawAttackScheme(ctx, scheme, cardData, gridX, gridY, cell, gap);
      const labelRaw = scheme.label ?? (schemeCount > 1 ? (idx === 0 ? 'Base' : (idx === 1 ? 'Alt' : `Alt ${idx}`)) : '');
      if (labelRaw) {
        ctx.font = `600 ${Math.max(ps(7), 7)}px "Noto Sans", "Helvetica", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(labelRaw, gridX + gridW / 2, gridY + gridHeight + Math.max(ps(10), 8));
      }
    });
    const blindspotX = startX + schemeCount * (gridW + spacing);
    drawBlindspotGrid(ctx, cardData, blindspotX, gridY, cell, gap);
  }

  // Числа ресурсов в декоративных элементах
  const costValue = String(cardData.cost ?? 0);
  drawCenteredValue(ctx, costValue, CARD_LAYOUT.summonOrb, px, py, ps, {
    fontFamily: '"Cinzel", "Times New Roman", serif'
  });

  if (cardData.locked) {
    const lockSize = Math.max(ps(CARD_LAYOUT.lock.size), 18);
    drawLockIcon(ctx, px(CARD_LAYOUT.lock.centerX), py(CARD_LAYOUT.lock.centerY), lockSize);
  }

  if (cardData.type === 'UNIT') {
    const activationOverride = (opts && Object.prototype.hasOwnProperty.call(opts, 'activationOverride'))
      ? opts.activationOverride
      : ((opts && Object.prototype.hasOwnProperty.call(opts, 'activation')) ? opts.activation : null);
    const actBase = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const act = (activationOverride != null) ? activationOverride : actBase;
    drawCenteredValue(ctx, String(act), CARD_LAYOUT.activationOrb, px, py, ps, {
      fontFamily: '"Cinzel", "Times New Roman", serif'
    });

    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    drawCenteredValue(ctx, String(hpToShow), CARD_LAYOUT.hpCrystal, px, py, ps, {
      fontFamily: '"Noto Sans", "Helvetica", sans-serif',
      fillStyle: '#f3fff4',
      strokeStyle: 'rgba(14, 78, 62, 0.4)',
      shadowColor: 'rgba(4, 32, 26, 0.35)',
      strokeRatio: 0.1
    });
    drawCenteredValue(ctx, String(atkToShow), CARD_LAYOUT.atkCrystal, px, py, ps, {
      fontFamily: '"Noto Sans", "Helvetica", sans-serif',
      fillStyle: '#fff4f4',
      strokeStyle: 'rgba(95, 24, 24, 0.45)',
      shadowColor: 'rgba(45, 10, 10, 0.4)',
      strokeRatio: 0.11
    });
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

function drawCenteredValue(ctx, text, layoutPart, px, py, ps, options = {}) {
  if (text == null || text === '') return;
  const centerX = px(layoutPart.centerX ?? 0);
  const centerY = py(layoutPart.centerY ?? 0);
  const radiusX = Math.max(px(layoutPart.radiusX ?? layoutPart.radius ?? 0), 1);
  const radiusY = Math.max(py(layoutPart.radiusY ?? layoutPart.radius ?? 0), 1);
  let fontSize = Math.max(ps(layoutPart.baseFont ?? 32), 8);
  const minFont = Math.max(ps(layoutPart.minFont ?? 18), 8);
  const fontFamily = options.fontFamily || '"Cinzel", "Times New Roman", serif';
  const fontWeight = options.fontWeight || 700;
  const strokeRatio = options.strokeRatio ?? 0.12;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.fillStyle || '#f8fafc';
  ctx.strokeStyle = options.strokeStyle || 'rgba(15, 23, 42, 0.6)';
  ctx.shadowColor = options.shadowColor || 'rgba(8, 12, 24, 0.6)';
  ctx.shadowBlur = Math.max(1, Math.round(fontSize * 0.2));
  while (fontSize > minFont) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const heightEstimate = fontSize * 0.9;
    if (metrics.width <= radiusX * 1.7 && heightEstimate <= radiusY * 1.8) break;
    fontSize -= 1;
  }
  ctx.font = `${fontWeight} ${Math.max(fontSize, minFont)}px ${fontFamily}`;
  ctx.lineWidth = Math.max(1, Math.round(fontSize * strokeRatio));
  try { ctx.strokeText(text, centerX, centerY); } catch {}
  try { ctx.fillText(text, centerX, centerY); } catch {}
  ctx.restore();
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
  const baseW = CARD_LAYOUT.baseWidth;
  const baseH = CARD_LAYOUT.baseHeight;
  const ill = CARD_LAYOUT.illustration;
  const illX = ill.x / baseW;
  const illY = ill.y / baseH;
  const illW = ill.width / baseW;
  const illH = ill.height / baseH;
  const w = cardMesh.geometry.parameters.width;
  const t = cardMesh.geometry.parameters.height;
  const h = cardMesh.geometry.parameters.depth;
  const planeW = w * illW;
  const planeH = h * illH;
  const centerX = illX + illW / 2;
  const centerY = illY + illH / 2;
  const offsetX = (centerX - 0.5) * w;
  const offsetZ = (centerY - 0.5) * h;
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

