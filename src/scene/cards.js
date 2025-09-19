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
  const baseNameFont = 9 * 1.4;
  const minNameFontValue = 7 * 1.4;
  let nameFont = Math.max(ps(baseNameFont), baseNameFont);
  const minNameFont = Math.max(ps(minNameFontValue), minNameFontValue);
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

  const footerHeight = Math.max(py(26), Math.round(20 * scaleY));
  const footerBaseY = height - footerHeight;
  let diagramTop = footerBaseY;
  let diagramCell = null;
  let diagramGap = null;

  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(Math.round(ps(8)), 6);
    diagramGap = Math.max(Math.round(ps(1.5)), 1);
    const diagramHeight = diagramCell * 3 + diagramGap * 2;
    const diagramSpacing = Math.max(py(10), 8);
    diagramTop = footerBaseY - diagramSpacing - diagramHeight;
    const minDiagramTop = illY + illH + Math.max(py(24), 20);
    if (diagramTop < minDiagramTop) diagramTop = minDiagramTop;
  }

  const textMaxY = (cardData.type === 'UNIT')
    ? diagramTop - Math.max(ps(6), 6)
    : footerBaseY - Math.max(ps(6), 6);
  wrapText(ctx, text, textX, textY, textWidth, Math.max(ps(11), 12), textMaxY);

  // Нижний пояс карты с ресурсами
  ctx.fillStyle = 'rgba(8, 12, 24, 0.58)';
  ctx.fillRect(0, footerBaseY, width, footerHeight);

  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'left';
  const iconSize = Math.max(ps(16), 14);
  const footerCenterY = footerBaseY + footerHeight / 2;
  const manaCenterX = px(28);
  drawManaOrbIcon(ctx, manaCenterX, footerCenterY, iconSize);
  const costTextX = manaCenterX + iconSize / 2 + Math.max(ps(6), 6);
  const costBaseline = footerCenterY + Math.max(ps(2), 2);
  const numberFontSize = Math.max(ps(11), 11);
  ctx.font = `700 ${numberFontSize}px "Noto Sans", "Helvetica", sans-serif`;
  const costValue = String(cardData.cost ?? 0);
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
    const playCenterX = costTextX + inlineOffset + playSize / 2 + Math.max(ps(10), 8);
    drawPlayIcon(ctx, playCenterX, footerCenterY, playSize);
    ctx.fillText(String(act), playCenterX + playSize / 2 + Math.max(ps(4), 4), costBaseline);
    const actWidth = ctx.measureText(String(act)).width;
    inlineOffset += playSize + Math.max(ps(12), 10) + actWidth;
  }

  if (cardData.type === 'UNIT') {
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statIconSize = Math.max(ps(15), 13);
    const statGap = Math.max(ps(4), 4);
    const statSpacing = Math.max(ps(18), 14);
    const statsRightPadding = Math.max(px(16), 14);
    const hpText = String(hpToShow);
    const atkText = String(atkToShow);
    ctx.font = `700 ${numberFontSize}px "Noto Sans", "Helvetica", sans-serif`;
    const hpWidth = ctx.measureText(hpText).width;
    const atkWidth = ctx.measureText(atkText).width;
    let cursorX = width - statsRightPadding;

    const hpTextX = cursorX - hpWidth;
    const hpIconCenterX = hpTextX - statGap - statIconSize / 2;
    drawHeartIcon(ctx, hpIconCenterX, footerCenterY, statIconSize);
    ctx.fillText(hpText, hpTextX, costBaseline);
    cursorX = hpIconCenterX - statIconSize / 2 - statSpacing;

    const atkTextX = cursorX - atkWidth;
    const atkIconCenterX = atkTextX - statGap - statIconSize / 2;
    drawSwordIcon(ctx, atkIconCenterX, footerCenterY, statIconSize);
    ctx.fillText(atkText, atkTextX, costBaseline);

    const cell = diagramCell ?? Math.max(Math.round(ps(8)), 6);
    const gap = diagramGap ?? Math.max(Math.round(ps(1.5)), 1);
    const gridW = cell * 3 + gap * 2;
    const spacing = Math.max(Math.round(ps(14)), 10);
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
    const highlightCells = new Set();
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
      highlightCells.add(`${rr},${cc}`);
    }
    if (!highlightCells.size) highlightCells.add('0,1');
    for (const key of highlightCells) {
      const [rr, cc] = key.split(',').map(Number);
      const cx = x + cc * (cell + gap);
      const cy = y + rr * (cell + gap);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = accentLine;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
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

// Плоские иконки меча и сердца для панели статов
function drawSwordIcon(ctx, x, y, size) {
  const scale = size / 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(3, 6);
  ctx.lineTo(0, 9);
  ctx.lineTo(-3, 6);
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-5.2, 4);
  ctx.lineTo(5.2, 4);
  ctx.stroke();

  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, 10);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(0, 11, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHeartIcon(ctx, x, y, size) {
  const scale = size / 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(0, 0, -6.5, -2.5, -6.5, -6.2);
  ctx.bezierCurveTo(-6.5, -9.2, -3.5, -10.5, 0, -7.8);
  ctx.bezierCurveTo(3.5, -10.5, 6.5, -9.2, 6.5, -6.2);
  ctx.bezierCurveTo(6.5, -2.5, 0, 0, 0, 6);
  ctx.closePath();
  ctx.fillStyle = '#f87171';
  ctx.fill();
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(-1.5, -2);
  ctx.quadraticCurveTo(-3.5, -3.5, -3.5, -5.8);
  ctx.quadraticCurveTo(-1.6, -5.2, -0.6, -3.6);
  ctx.closePath();
  ctx.fill();

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

