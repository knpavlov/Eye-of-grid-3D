// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, frontByElement: {}, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

const CARD_FRONT_URLS = {
  FIRE: 'textures/card_front_final_fire.png',
  WATER: 'textures/card_front_final_water.png',
  EARTH: 'textures/card_front_final_earth.png',
  FOREST: 'textures/card_front_final_forest.png',
  BIOLITH: 'textures/card_front_final_biolith.png',
  NEUTRAL: 'textures/card_front_final_earth.png',
};

const CARD_LAYOUT = {
  baseWidth: 832,
  baseHeight: 1248,
  nameY: 228,
  typeY: 286,
  art: { x: 120, y: 300, width: 592, height: 460 },
  text: { x: 120, top: 808, width: 592, bottomUnit: 948, bottomSpell: 1084 },
  diagrams: { top: 956, spacing: 60, gap: 6, cell: 32 },
  stats: {
    areaTop: 1038,
    summon: { x: 186, y: 210 },
    activation: { x: 646, y: 206 },
    lock: { x: 702, y: 246 },
    hp: { x: 210, y: 1084 },
    atk: { x: 622, y: 1084 },
  },
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

function normalizeElementKey(element) {
  if (!element) return 'NEUTRAL';
  const key = String(element).toUpperCase();
  return Object.prototype.hasOwnProperty.call(CARD_FRONT_URLS, key) ? key : 'NEUTRAL';
}

function ensureFrontTexture(normalizedKey) {
  const key = normalizeElementKey(normalizedKey);
  if (!CARD_TEX.frontByElement) CARD_TEX.frontByElement = {};
  if (!CARD_TEX.frontByElement[key]) {
    const url = CARD_FRONT_URLS[key] || CARD_FRONT_URLS.NEUTRAL;
    if (url) {
      try { CARD_TEX.frontByElement[key] = getCachedTexture(url); } catch {}
    }
  }
  return CARD_TEX.frontByElement[key] || null;
}

function getFrontTextureForElement(element) {
  const tex = ensureFrontTexture(normalizeElementKey(element));
  if (tex) return tex;
  const fallback = ensureFrontTexture('NEUTRAL');
  if (fallback && !CARD_TEX.front) CARD_TEX.front = fallback;
  return fallback || CARD_TEX.front || null;
}

function pickDefaultFrontTexture() {
  const order = ['NEUTRAL', 'FOREST', 'EARTH', 'WATER', 'FIRE', 'BIOLITH'];
  for (const key of order) {
    const tex = ensureFrontTexture(key);
    if (tex) return tex;
  }
  return null;
}

export function preloadCardTextures() {
  try {
    if (!CARD_TEX.frontByElement) CARD_TEX.frontByElement = {};
    Object.keys(CARD_FRONT_URLS).forEach((key) => {
      const tex = ensureFrontTexture(key);
      if (tex) CARD_TEX.frontByElement[key] = tex;
    });
    const defaultFront = pickDefaultFrontTexture();
    if (defaultFront) CARD_TEX.front = defaultFront;
    CARD_TEX.back     = getCachedTexture('textures/card_back_main.jpeg');
    CARD_TEX.deckSide = getCachedTexture('textures/card_deck_side_view.jpeg');
  } catch {}
  try { if (typeof window !== 'undefined') window.CARD_TEX = CARD_TEX; } catch {}
}

export function drawCardFace(ctx, cardData, width, height, hpOverride = null, atkOverride = null, opts = {}) {
  getTHREE();
  const BASE_W = CARD_LAYOUT.baseWidth;
  const BASE_H = CARD_LAYOUT.baseHeight;
  const scaleX = width / BASE_W;
  const scaleY = height / BASE_H;
  const scale = (scaleX + scaleY) / 2;
  const px = (val) => Math.round(val * scaleX);
  const py = (val) => Math.round(val * scaleY);
  const pxSize = (val) => Math.round(val * scaleX);
  const pySize = (val) => Math.round(val * scaleY);
  const pf = (val, min = 8) => Math.max(min, Math.round(val * scale));

  try {
    const tex = getFrontTextureForElement(cardData.element);
    const imgFront = tex && tex.image ? tex.image : null;
    if (imgFront && imgFront.width && imgFront.height) {
      ctx.drawImage(imgFront, 0, 0, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1e293b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } catch {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  const normalizedElement = normalizeElementKey(cardData.element);
  const elementLabels = {
    FIRE: 'Fire',
    WATER: 'Water',
    EARTH: 'Earth',
    FOREST: 'Forest',
    BIOLITH: 'Biolith',
    NEUTRAL: 'Neutral',
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  let displayName = (cardData.name || '').trim();
  if (!displayName) displayName = 'Unknown Card';
  if (displayName.length > 48) displayName = `${displayName.slice(0, 48)}…`;
  const nameMaxWidth = width - px(240);
  let nameFont = pf(64, 24);
  const minNameFont = pf(40, 18);
  while (ctx.measureText(displayName).width > nameMaxWidth && nameFont > minNameFont) {
    nameFont -= 1;
  }
  ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
  ctx.fillText(displayName, width / 2, py(CARD_LAYOUT.nameY));

  const typeParts = [];
  if (elementLabels[normalizedElement]) typeParts.push(elementLabels[normalizedElement]);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  if (typeLine) {
    ctx.font = `600 ${pf(28, 14)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.fillText(typeLine, width / 2, py(CARD_LAYOUT.typeY));
  }

  const illX = px(CARD_LAYOUT.art.x);
  const illY = py(CARD_LAYOUT.art.y);
  const illW = pxSize(CARD_LAYOUT.art.width);
  const illH = pySize(CARD_LAYOUT.art.height);
  ctx.save();
  ctx.fillStyle = 'rgba(8, 15, 32, 0.55)';
  ctx.fillRect(illX, illY, illW, illH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = Math.max(1, Math.round(scale * 1.2));
  ctx.strokeRect(illX, illY, illW, illH);
  ctx.restore();

  let img = CARD_IMAGES[cardData.id] || CARD_IMAGES[cardData.id?.toLowerCase?.()] || CARD_IMAGES[(cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '_')];
  if (!img && !CARD_PENDING[cardData.id]) {
    CARD_PENDING[cardData.id] = true;
    const candidates = [
      `card images/${cardData.id}.png`,
      `card images/${(cardData.id || '').toLowerCase()}.png`,
      `card images/${(cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '_')}.png`,
      `card images/${(cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '-')}.png`,
    ];
    (function tryLoad(i) {
      if (i >= candidates.length) { CARD_PENDING[cardData.id] = false; return; }
      const im = new Image();
      im.onload = () => { CARD_IMAGES[cardData.id] = im; CARD_PENDING[cardData.id] = false; try { if (window.requestCardsRedraw) window.requestCardsRedraw(); } catch {} };
      im.onerror = () => tryLoad(i + 1);
      im.src = encodeURI(candidates[i]);
    })(0);
  }

  if (img && img.complete && !(typeof location !== 'undefined' && location.protocol === 'file:')) {
    const ar = img.width / img.height;
    let drawW = illW;
    let drawH = illH;
    if (drawW / drawH > ar) {
      drawW = drawH * ar;
    } else {
      drawH = drawW / ar;
    }
    const dx = illX + (illW - drawW) / 2;
    const dy = illY + (illH - drawH) / 2;
    try { ctx.drawImage(img, dx, dy, drawW, drawH); } catch {}
  } else {
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 ${pf(28, 14)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Illustration', illX + illW / 2, illY + illH / 2);
    ctx.restore();
  }

  const textSource = cardData.desc || cardData.text || (Array.isArray(cardData.keywords) ? cardData.keywords.join(', ') : '');
  const bodyText = typeof textSource === 'string' ? textSource.trim() : '';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${pf(28, 14)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const textX = px(CARD_LAYOUT.text.x);
  const textWidth = pxSize(CARD_LAYOUT.text.width);
  const textY = py(CARD_LAYOUT.text.top);

  let diagramTop = null;
  let diagramCell = null;
  let diagramGap = null;
  let diagramSpacing = null;
  let textMaxY = py(CARD_LAYOUT.text.bottomSpell);

  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(pxSize(CARD_LAYOUT.diagrams.cell), 7);
    diagramGap = Math.max(pxSize(CARD_LAYOUT.diagrams.gap), 2);
    diagramSpacing = Math.max(pxSize(CARD_LAYOUT.diagrams.spacing), diagramGap * 2);
    const gridHeight = diagramCell * 3 + diagramGap * 2;
    const statsAreaTop = py(CARD_LAYOUT.stats.areaTop);
    const minDiagramTop = textY + Math.max(pf(24, 12), 18);
    const desiredDiagramTop = py(CARD_LAYOUT.diagrams.top);
    diagramTop = Math.max(minDiagramTop, desiredDiagramTop);
    if (diagramTop + gridHeight > statsAreaTop) {
      diagramTop = Math.max(minDiagramTop, statsAreaTop - gridHeight);
    }
    const bottomLimit = py(CARD_LAYOUT.text.bottomUnit);
    textMaxY = Math.max(textY, Math.min(bottomLimit, diagramTop - Math.max(pf(20, 12), 12)));
  }

  wrapText(ctx, bodyText, textX, textY, textWidth, pf(28, 14), textMaxY);

  if (cardData.type === 'UNIT') {
    const cell = diagramCell ?? Math.max(pxSize(CARD_LAYOUT.diagrams.cell), 7);
    const gap = diagramGap ?? Math.max(pxSize(CARD_LAYOUT.diagrams.gap), 2);
    const spacing = diagramSpacing ?? Math.max(pxSize(CARD_LAYOUT.diagrams.spacing), gap * 2);
    const gridW = cell * 3 + gap * 2;
    const schemes = getAttackSchemes(cardData);
    const schemeCount = schemes.length;
    const columns = schemeCount + 1;
    const totalWidth = gridW * columns + spacing * (columns - 1);
    const startX = (width - totalWidth) / 2;
    const gridY = diagramTop ?? py(CARD_LAYOUT.diagrams.top);
    const gridHeight = cell * 3 + gap * 2;

    schemes.forEach((scheme, idx) => {
      const gridX = startX + idx * (gridW + spacing);
      drawAttackScheme(ctx, scheme, cardData, gridX, gridY, cell, gap);
      const labelRaw = scheme.label ?? (schemeCount > 1 ? (idx === 0 ? 'Base' : (idx === 1 ? 'Alt' : `Alt ${idx}`)) : '');
      if (labelRaw) {
        ctx.font = `600 ${pf(24, 12)}px "Noto Sans", "Helvetica", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(labelRaw, gridX + gridW / 2, gridY + gridHeight + Math.max(pf(20, 12), 12));
      }
    });

    const blindspotX = startX + schemeCount * (gridW + spacing);
    drawBlindspotGrid(ctx, cardData, blindspotX, gridY, cell, gap);
  }

  const summonFont = pf(120, 26);
  drawNumberBadge(ctx, String(cardData.cost ?? 0), px(CARD_LAYOUT.stats.summon.x), py(CARD_LAYOUT.stats.summon.y), summonFont, {
    fill: 'rgba(248,250,252,0.95)',
    outline: 'rgba(15,23,42,0.55)',
    shadowColor: 'rgba(15,23,42,0.45)',
  });

  const activationOverride = (opts && Object.prototype.hasOwnProperty.call(opts, 'activationOverride'))
    ? opts.activationOverride
    : ((opts && Object.prototype.hasOwnProperty.call(opts, 'activation')) ? opts.activation : null);
  const actBase = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
  const activationValue = activationOverride != null ? activationOverride : actBase;
  const activationFont = pf(76, 18);
  drawNumberBadge(ctx, String(activationValue), px(CARD_LAYOUT.stats.activation.x), py(CARD_LAYOUT.stats.activation.y), activationFont, {
    fill: 'rgba(248,250,252,0.95)',
    outline: 'rgba(30,41,59,0.5)',
    shadowColor: 'rgba(15,23,42,0.35)',
  });

  if (cardData.locked) {
    const lockSize = Math.max(pf(54, 18), pxSize(42));
    drawLockIcon(ctx, px(CARD_LAYOUT.stats.lock.x), py(CARD_LAYOUT.stats.lock.y), lockSize);
  }

  if (cardData.type === 'UNIT') {
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const hpFont = pf(92, 22);
    const atkFont = pf(92, 22);
    drawNumberBadge(ctx, String(hpToShow), px(CARD_LAYOUT.stats.hp.x), py(CARD_LAYOUT.stats.hp.y), hpFont, {
      fill: 'rgba(224,252,232,0.94)',
      outline: 'rgba(22,101,52,0.55)',
      shadowColor: 'rgba(22,163,74,0.35)',
    });
    drawNumberBadge(ctx, String(atkToShow), px(CARD_LAYOUT.stats.atk.x), py(CARD_LAYOUT.stats.atk.y), atkFont, {
      fill: 'rgba(254,226,226,0.94)',
      outline: 'rgba(220,38,38,0.55)',
      shadowColor: 'rgba(220,38,38,0.28)',
    });
  }
}


function drawNumberBadge(ctx, text, x, y, fontSize, options = {}) {
  const {
    fill = '#f8fafc',
    outline = 'rgba(15,23,42,0.6)',
    weight = 700,
    shadowColor = 'rgba(0,0,0,0.35)',
    shadowBlur = Math.max(1, Math.round(fontSize * 0.18)),
  } = options;

  ctx.save();
  ctx.font = `${weight} ${fontSize}px "Cinzel", "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }
  if (outline) {
    ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.08));
    ctx.strokeStyle = outline;
    try { ctx.strokeText(text, x, y); } catch {}
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
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
  const img = CARD_IMAGES[cardData.id] || CARD_IMAGES[cardData.id?.toLowerCase?.()] || CARD_IMAGES[(cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '_')];
  const W = CARD_LAYOUT.baseWidth;
  const H = CARD_LAYOUT.baseHeight;
  const art = CARD_LAYOUT.art;
  const w = cardMesh.geometry.parameters.width;
  const t = cardMesh.geometry.parameters.height;
  const h = cardMesh.geometry.parameters.depth;
  const planeW = w * (art.width / W);
  const planeH = h * (art.height / H);
  const centerX = (art.x + art.width / 2) / W;
  const centerY = (art.y + art.height / 2) / H;
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
  const canvas = document.createElement('canvas');
  canvas.width = CARD_LAYOUT.baseWidth;
  canvas.height = CARD_LAYOUT.baseHeight;
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

