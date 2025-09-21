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

export function drawCardFace(ctx, cardData, width, height, hpOverride = null, atkOverride = null, opts = {}) {
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

  // Верхняя часть: ресурсы, имя и тип
  const elementLabels = { FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', FOREST: 'Forest', BIOLITH: 'Biolith', NEUTRAL: 'Neutral' };
  const hasActivation = cardData.type === 'UNIT';
  const summonCenterX = width / 2;
  const summonCenterY = py(58);
  const summonRadius = Math.max(ps(46), 36);
  const activationRadius = Math.max(ps(24), 18);
  const activationCenterX = width - px(52);
  const activationCenterY = py(50);

  const costText = String(cardData.cost ?? 0);
  let costFont = Math.max(ps(38), 30);
  if (costText.length >= 3) costFont = Math.max(ps(32), 26);
  if (costText.length >= 4) costFont = Math.max(ps(26), 22);
  drawOutlinedText(ctx, costText, summonCenterX, summonCenterY, `700 ${costFont}px "Cinzel", "Times New Roman", serif`, {
    baseline: 'middle',
    lineWidth: Math.max(ps(3.4), 2.4),
    stroke: 'rgba(15,23,42,0.65)',
    fill: '#fff7ed',
    shadowColor: 'rgba(15,23,42,0.55)',
    shadowBlur: Math.max(ps(8), 6),
  });

  if (cardData.locked) {
    const lockSize = Math.max(ps(22), 18);
    const lockOffsetX = summonRadius * 0.68;
    const lockOffsetY = summonRadius * 0.62;
    drawLockIcon(ctx, summonCenterX - lockOffsetX, summonCenterY - lockOffsetY, lockSize);
  }

  let headerBottom = summonCenterY + summonRadius + Math.max(py(14), 12);

  if (hasActivation) {
    const activationOverride = (opts && Object.prototype.hasOwnProperty.call(opts, 'activationOverride'))
      ? opts.activationOverride
      : ((opts && Object.prototype.hasOwnProperty.call(opts, 'activation')) ? opts.activation : null);
    const actBase = (cardData.activation != null)
      ? cardData.activation
      : Math.max(0, (cardData.cost || 0) - 1);
    const act = (activationOverride != null) ? activationOverride : actBase;
    const actText = String(act);
    let actFont = Math.max(ps(22), 18);
    if (actText.length >= 3) actFont = Math.max(ps(18), 15);
    if (actText.length >= 4) actFont = Math.max(ps(16), 13);
    drawOutlinedText(ctx, actText, activationCenterX, activationCenterY, `700 ${actFont}px "Cinzel", "Times New Roman", serif`, {
      baseline: 'middle',
      lineWidth: Math.max(ps(2.6), 1.8),
      stroke: 'rgba(15,23,42,0.6)',
      fill: '#e0f2fe',
      shadowColor: 'rgba(15,23,42,0.45)',
      shadowBlur: Math.max(ps(6), 5),
    });
    headerBottom = Math.max(headerBottom, activationCenterY + activationRadius + Math.max(py(10), 8));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  const nameMaxWidth = width - px(70);
  let displayName = (cardData.name || '').trim();
  if (displayName.length > 40) displayName = displayName.slice(0, 40) + '…';
  const baseNameFont = 9 * 1.45;
  const minNameFontValue = 7 * 1.35;
  let nameFont = Math.max(ps(baseNameFont), baseNameFont);
  const minNameFont = Math.max(ps(minNameFontValue), minNameFontValue);
  const nameY = Math.max(headerBottom + Math.max(py(12), 10), py(106));
  while (true) {
    ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
    if (ctx.measureText(displayName).width <= nameMaxWidth || nameFont <= minNameFont) break;
    nameFont = Math.max(minNameFont, nameFont - 1);
  }
  ctx.fillText(displayName, width / 2, nameY);

  const typeParts = [];
  const elementLabel = elementLabels[cardData.element] || elementLabels.NEUTRAL;
  if (elementLabel) typeParts.push(elementLabel);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  const typeY = nameY + Math.max(py(16), 14);
  if (typeLine) {
    ctx.font = `500 ${Math.max(ps(7.2), 7)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillStyle = 'rgba(226,232,240,0.82)';
    ctx.fillText(typeLine, width / 2, typeY);
  }

  // Иллюстрация и подложка под неё
  const illX = px(24);
  let illY = Math.max(typeY + Math.max(py(12), 10), py(92));
  const illW = width - px(48);
  const bottomReserve = hasActivation ? Math.max(py(118), 102) : Math.max(py(82), 68);
  let availableSpace = height - bottomReserve - illY;
  if (availableSpace <= 0) {
    availableSpace = Math.max(py(120), Math.round(height * 0.42));
    illY = Math.max(py(82), height - bottomReserve - availableSpace);
  }
  let illH = Math.min(py(150), availableSpace);
  const minIllH = Math.min(py(116), availableSpace);
  if (illH < minIllH) illH = minIllH;
  if (illH > availableSpace) illH = availableSpace;
  if (!Number.isFinite(illH) || illH <= 0) {
    illH = Math.max(py(120), Math.round(height * 0.38));
  }
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

  // Текстовое поле с описанием
  const text = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${Math.max(ps(8.5), 9)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const textX = illX;
  const textY = illY + illH + Math.max(ps(10), 8);
  const textWidth = illW;

  let textMaxY = height - Math.max(py(34), 28);
  let diagramTop = null;
  let diagramCell = null;
  let diagramGap = null;
  let crystalsCenterY = null;
  let crystalsOffsetX = null;

  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(Math.round(ps(8)), 6);
    diagramGap = Math.max(Math.round(ps(1.5)), 1);
    const diagramHeight = diagramCell * 3 + diagramGap * 2;
    const crystalsHeight = Math.max(py(52), 44);
    crystalsCenterY = height - Math.max(py(32), 26);
    const crystalsHalfHeight = crystalsHeight / 2;
    const statsAreaHeight = Math.max(py(108), 92);
    const statsAreaTop = height - statsAreaHeight;
    const minDiagramTop = Math.max(statsAreaTop + Math.max(py(4), 4), illY + illH + Math.max(py(20), 18));
    const maxDiagramTop = crystalsCenterY - crystalsHalfHeight - Math.max(py(14), 12) - diagramHeight;
    let candidateTop = statsAreaTop + Math.max(py(8), 6);
    if (candidateTop > maxDiagramTop) candidateTop = maxDiagramTop;
    if (candidateTop < minDiagramTop) candidateTop = minDiagramTop;
    if (!Number.isFinite(candidateTop)) candidateTop = minDiagramTop;
    diagramTop = candidateTop;
    textMaxY = Math.min(textMaxY, diagramTop - Math.max(ps(6), 6));
    crystalsOffsetX = Math.max(px(58), 54);
  }

  if (textMaxY < textY) textMaxY = textY;

  wrapText(ctx, text, textX, textY, textWidth, Math.max(ps(11), 12), textMaxY);

  if (cardData.type === 'UNIT') {
    const cell = diagramCell ?? Math.max(Math.round(ps(8)), 6);
    const gap = diagramGap ?? Math.max(Math.round(ps(1.5)), 1);
    const gridW = cell * 3 + gap * 2;
    const spacing = Math.max(Math.round(ps(14)), 10);
    const schemes = getAttackSchemes(cardData);
    const schemeCount = schemes.length;
    const columns = schemeCount + 1;
    const totalWidth = gridW * columns + spacing * (columns - 1);
    const startX = (width - totalWidth) / 2;
    const gridY = diagramTop ?? (height - Math.max(py(120), 96));
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

    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statFontBase = Math.max(ps(24), 20);
    const atkText = String(atkToShow);
    const hpText = String(hpToShow);
    let atkFont = statFontBase;
    if (atkText.length >= 3) atkFont = Math.max(ps(20), 16);
    if (atkText.length >= 4) atkFont = Math.max(ps(18), 14);
    let hpFont = statFontBase;
    if (hpText.length >= 3) hpFont = Math.max(ps(20), 16);
    if (hpText.length >= 4) hpFont = Math.max(ps(18), 14);
    const statLineWidth = Math.max(ps(2.4), 1.8);
    const statShadowBlur = Math.max(ps(7), 5);
    const centerY = crystalsCenterY ?? (height - Math.max(py(32), 26));
    const offsetX = crystalsOffsetX ?? Math.max(px(58), 54);
    drawOutlinedText(ctx, atkText, offsetX, centerY, `700 ${atkFont}px "Cinzel", "Times New Roman", serif`, {
      baseline: 'middle',
      lineWidth: statLineWidth,
      stroke: 'rgba(67,20,7,0.68)',
      fill: '#fee2e2',
      shadowColor: 'rgba(120,20,20,0.45)',
      shadowBlur: statShadowBlur,
    });
    drawOutlinedText(ctx, hpText, width - offsetX, centerY, `700 ${hpFont}px "Cinzel", "Times New Roman", serif`, {
      baseline: 'middle',
      lineWidth: statLineWidth,
      stroke: 'rgba(4,46,17,0.65)',
      fill: '#dcfce7',
      shadowColor: 'rgba(15,118,110,0.38)',
      shadowBlur: statShadowBlur,
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

function getElementColor(element) {
  const colors = { FIRE: '#dc2626', WATER: '#0369a1', EARTH: '#525252', FOREST: '#166534', BIOLITH: '#64748b' };
  return colors[element] || '#64748b';
}

function drawOutlinedText(ctx, text, x, y, font, opts = {}) {
  const {
    fill = '#f8fafc',
    stroke = 'rgba(15,23,42,0.8)',
    lineWidth = 2,
    align = 'center',
    baseline = 'alphabetic',
    shadowColor = null,
    shadowBlur = 0,
    shadowOffsetX = 0,
    shadowOffsetY = 0,
  } = opts;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadowColor && shadowBlur > 0) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  if (stroke && lineWidth > 0) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    try { ctx.strokeText(text, x, y); } catch {}
  }
  if (fill) {
    ctx.fillStyle = fill;
    try { ctx.fillText(text, x, y); } catch {}
  }
  ctx.restore();
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

