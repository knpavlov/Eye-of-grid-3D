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
  const BASE_W = 832;
  const BASE_H = 1248;
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

  const nameArea = {
    centerX: width / 2,
    centerY: py(360),
    maxWidth: width - px(160)
  };
  let displayName = (cardData.name || '').trim();
  if (displayName.length > 48) displayName = displayName.slice(0, 48) + '…';
  const baseNameFont = 26;
  const minNameFontValue = 18;
  let nameFont = Math.max(ps(baseNameFont), baseNameFont);
  const minNameFont = Math.max(ps(minNameFontValue), minNameFontValue);
  while (true) {
    ctx.font = `600 ${nameFont}px "Cinzel", "Times New Roman", serif`;
    if (ctx.measureText(displayName).width <= nameArea.maxWidth || nameFont <= minNameFont) break;
    nameFont = Math.max(minNameFont, nameFont - 1);
  }
  ctx.fillText(displayName, nameArea.centerX, nameArea.centerY);

  const typeParts = [];
  const elementLabel = elementLabels[cardData.element] || elementLabels.NEUTRAL;
  if (elementLabel) typeParts.push(elementLabel);
  if (cardData.type === 'UNIT') typeParts.push('Creature');
  else if (cardData.type === 'SPELL') typeParts.push('Spell');
  const typeLine = typeParts.join(' · ');
  if (typeLine) {
    ctx.font = `500 ${Math.max(ps(20), 14)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.fillText(typeLine, nameArea.centerX, py(414));
  }

  // Рамка под иллюстрацию
  const illX = px(120);
  const illY = py(440);
  const illW = width - px(240);
  const illH = py(456);
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
    ctx.font = `500 ${Math.max(ps(24), 12)}px "Noto Sans", "Helvetica", sans-serif`;
    ctx.fillText('Illustration', width / 2, illY + Math.round(illH / 2));
  }

  // Текстовое поле (уменьшенный шрифт и контролируемая высота)
  const text = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${Math.max(ps(20), 12)}px "Noto Sans", "Helvetica", sans-serif`;
  ctx.textAlign = 'left';
  const textX = illX;
  const textY = illY + illH + Math.max(py(48), 24);
  const textWidth = illW;

  const statsBaseline = height - py(104);
  const statsCenterY = statsBaseline - Math.max(py(12), 8);
  let diagramTop = statsBaseline;
  let diagramCell = null;
  let diagramGap = null;

  if (cardData.type === 'UNIT') {
    diagramCell = Math.max(Math.round(ps(54)), 18);
    diagramGap = Math.max(Math.round(ps(6)), 2);
    const diagramHeight = diagramCell * 3 + diagramGap * 2;
    const diagramSpacing = Math.max(py(80), 36);
    diagramTop = statsBaseline - Math.max(py(168), 96) - diagramHeight;
    const minDiagramTop = textY + Math.max(py(84), 42);
    if (diagramTop < minDiagramTop) diagramTop = minDiagramTop;
  }

  const textMaxY = (cardData.type === 'UNIT')
    ? diagramTop - Math.max(py(32), 16)
    : statsBaseline - Math.max(py(96), 48);
  wrapText(ctx, text, textX, textY, textWidth, Math.max(ps(28), 12), textMaxY);

  // Стоимость призыва в верхней сфере
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  const costValue = String(cardData.cost ?? 0);
  const costCenterX = width / 2;
  const costCenterY = py(176);
  const costFont = Math.max(ps(120), 40);
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.65)';
  ctx.shadowBlur = Math.max(ps(18), 8);
  ctx.font = `800 ${costFont}px "Cinzel", "Times New Roman", serif`;
  ctx.fillText(costValue, costCenterX, costCenterY);
  ctx.restore();

  if (cardData.locked) {
    const lockSize = Math.max(ps(48), 18);
    const lockOffsetX = px(126);
    const lockOffsetY = py(84);
    drawLockIcon(ctx, costCenterX + lockOffsetX, costCenterY - lockOffsetY, lockSize);
  }

  if (cardData.type === 'UNIT') {
    const activationOverride = (opts && Object.prototype.hasOwnProperty.call(opts, 'activationOverride'))
      ? opts.activationOverride
      : ((opts && Object.prototype.hasOwnProperty.call(opts, 'activation')) ? opts.activation : null);
    const actBase = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const act = (activationOverride != null) ? activationOverride : actBase;
    const activationCenterX = width - px(210);
    const activationCenterY = py(268);
    const activationFont = Math.max(ps(56), 20);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.65)';
    ctx.shadowBlur = Math.max(ps(12), 6);
    ctx.font = `700 ${activationFont}px "Cinzel", "Times New Roman", serif`;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(String(act), activationCenterX, activationCenterY);
    ctx.restore();
  }

  if (cardData.type === 'UNIT') {
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    const statsFont = Math.max(ps(68), 24);
    ctx.font = `800 ${statsFont}px "Cinzel", "Times New Roman", serif`;
    ctx.fillStyle = '#f8fafc';

    const hpCenterX = px(236);
    const atkCenterX = width - px(236);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.65)';
    ctx.shadowBlur = Math.max(ps(14), 6);
    ctx.fillText(String(hpToShow), hpCenterX, statsCenterY);
    ctx.fillText(String(atkToShow), atkCenterX, statsCenterY);
    ctx.restore();

    const cell = diagramCell ?? Math.max(Math.round(ps(54)), 18);
    const gap = diagramGap ?? Math.max(Math.round(ps(6)), 2);
    const gridW = cell * 3 + gap * 2;
    const spacing = Math.max(Math.round(ps(52)), 20);
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
        ctx.font = `600 ${Math.max(ps(22), 12)}px "Noto Sans", "Helvetica", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(labelRaw, gridX + gridW / 2, gridY + gridHeight + Math.max(py(44), 18));
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
  const W = 832;
  const H = 1248;
  const illX = 120;
  const illY = 440;
  const illW = W - 240;
  const illH = 456;
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

