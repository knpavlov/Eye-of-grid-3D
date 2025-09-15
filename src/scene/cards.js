// Card meshes and textures
import { getCtx } from './context.js';

// Local caches; mirror to window for compatibility with legacy code
const CARD_TEX = { front: null, back: null, deckSide: null };
const CARD_IMAGES = {};
const CARD_PENDING = {};

const BASE_CARD_SIZE = { WIDTH: 256, HEIGHT: 356 };
const ELEMENT_LABELS = {
  FIRE: 'Fire',
  WATER: 'Water',
  EARTH: 'Earth',
  FOREST: 'Forest',
  BIOLITH: 'Biolith',
  NEUTRAL: 'Neutral',
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
  const layout = createCardLayout(width, height);
  const elementColor = getElementColor(cardData.element);

  ctx.clearRect(0, 0, width, height);

  renderCardBackground(ctx, layout);
  renderCardFrame(ctx, layout, elementColor);
  renderHeader(ctx, cardData, layout, elementColor);
  renderCostBadges(ctx, cardData, layout);
  renderIllustration(ctx, cardData, layout);
  renderCardTextAndGrids(ctx, cardData, layout);
  renderFooter(ctx, cardData, layout, hpOverride, atkOverride);
}

// Расчёт пропорций и отступов карты под игровой шаблон
function createCardLayout(width, height) {
  const scaleX = width / BASE_CARD_SIZE.WIDTH;
  const scaleY = height / BASE_CARD_SIZE.HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const px = value => Math.round(value * scale);
  const clampPx = (value, min) => Math.max(min, Math.round(value * scale));

  const layout = { width, height, scale, px };

  layout.border = clampPx(8, 6);

  layout.header = {
    x: clampPx(18, 12),
    y: clampPx(18, 12),
    w: width - clampPx(36, 24),
    h: clampPx(40, 28),
    nameFont: clampPx(10, 9),
    elementFont: clampPx(8, 7),
    labelSpacing: clampPx(6, 4),
  };

  layout.cost = {
    cx: clampPx(34, 26),
    cy: clampPx(40, 28),
    size: clampPx(26, 20),
    font: clampPx(12, 10),
    lockSize: clampPx(14, 10),
  };

  layout.activation = {
    cx: width - clampPx(34, 26),
    cy: clampPx(40, 28),
    size: clampPx(24, 18),
    font: clampPx(11, 9),
  };

  const artX = clampPx(26, 18);
  const artY = clampPx(60, 42);
  const artW = width - clampPx(52, 36);
  const artH = clampPx(138, 110);

  layout.art = {
    x: artX,
    y: artY,
    w: artW,
    h: artH,
    radius: clampPx(10, 8),
  };

  layout.body = {
    x: artX,
    y: artY + artH + clampPx(6, 4),
    width: artW,
    padding: clampPx(8, 6),
    lineHeight: clampPx(10, 9),
    fontSize: clampPx(8, 7),
    labelFont: clampPx(9, 8),
  };
  layout.body.textColumnWidth = Math.round(layout.body.width * 0.55);
  layout.body.textInnerWidth = Math.max(32, layout.body.textColumnWidth - layout.body.padding * 2);
  layout.body.fullInnerWidth = Math.max(32, layout.body.width - layout.body.padding * 2);

  layout.grid = {
    cell: clampPx(12, 8),
    gap: Math.max(1, clampPx(2, 1)),
    labelFont: clampPx(8, 7),
    padding: clampPx(4, 3),
  };
  layout.grid.width = layout.grid.cell * 3 + layout.grid.gap * 2;
  layout.grid.x = layout.body.x + layout.body.textColumnWidth + layout.grid.padding;
  layout.grid.y = layout.body.y;
  layout.grid.secondX = layout.grid.x + layout.grid.width + layout.grid.padding;

  layout.footer = {
    top: height - clampPx(56, 44),
    height: clampPx(44, 36),
    paddingX: clampPx(24, 18),
    paddingY: clampPx(10, 8),
    icon: clampPx(18, 14),
    font: clampPx(11, 9),
    atkHpFont: clampPx(14, 12),
    labelFont: clampPx(8, 7),
    blockWidth: clampPx(64, 52),
    blockHeight: clampPx(34, 28),
    blockGap: clampPx(10, 8),
  };
  layout.footer.centerY = layout.footer.top + layout.footer.height / 2;

  const available = layout.footer.top - layout.body.y - layout.body.padding;
  layout.body.maxLines = Math.max(3, Math.floor(available / layout.body.lineHeight));

  return layout;
}

// Фоновая подложка карты
function renderCardBackground(ctx, layout) {
  try {
    const imgFront = CARD_TEX.front && CARD_TEX.front.image ? CARD_TEX.front.image : null;
    if (imgFront && imgFront.width && imgFront.height) {
      ctx.drawImage(imgFront, 0, 0, layout.width, layout.height);
      return;
    }
  } catch {}
  const gradient = ctx.createLinearGradient(0, 0, 0, layout.height);
  gradient.addColorStop(0, '#1e293b');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

// Внешняя рамка и внутренняя отбивка
function renderCardFrame(ctx, layout, elementColor) {
  const outerInset = layout.border;
  ctx.save();
  ctx.lineWidth = Math.max(layout.px(4), 3);
  ctx.strokeStyle = elementColor;
  ctx.strokeRect(outerInset, outerInset, layout.width - outerInset * 2, layout.height - outerInset * 2);
  const innerInset = outerInset + layout.px(4);
  if (innerInset * 2 < layout.width && innerInset * 2 < layout.height) {
    ctx.lineWidth = Math.max(layout.px(1.1), 1);
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.strokeRect(innerInset, innerInset, layout.width - innerInset * 2, layout.height - innerInset * 2);
  }
  ctx.restore();
}

// Шапка карты с именем и стихией
function renderHeader(ctx, cardData, layout, elementColor) {
  const header = layout.header;
  ctx.save();
  drawRoundedRectPath(ctx, header.x, header.y, header.w, header.h, layout.px(10));
  const gradient = ctx.createLinearGradient(header.x, header.y, header.x, header.y + header.h);
  gradient.addColorStop(0, 'rgba(15,23,42,0.9)');
  gradient.addColorStop(1, 'rgba(30,41,59,0.78)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = Math.max(layout.px(1.1), 1);
  ctx.stroke();
  ctx.restore();

  const rawName = (cardData.name || '').trim();
  const name = rawName.length > 28 ? `${rawName.slice(0, 27)}…` : rawName;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `600 ${header.nameFont}px "Arial", sans-serif`;
  ctx.fillText(name, layout.width / 2, header.y + header.h / 2 - header.labelSpacing / 2);

  const elementLabel = (ELEMENT_LABELS[cardData.element] || ELEMENT_LABELS.NEUTRAL).toUpperCase();
  ctx.font = `500 ${header.elementFont}px "Arial", sans-serif`;
  ctx.fillStyle = 'rgba(226,232,240,0.82)';
  ctx.fillText(elementLabel, layout.width / 2, header.y + header.h - header.labelSpacing);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = elementColor;
  ctx.lineWidth = Math.max(layout.px(2), 2);
  ctx.beginPath();
  ctx.moveTo(header.x + layout.px(12), header.y + header.h);
  ctx.lineTo(header.x + header.w - layout.px(12), header.y + header.h);
  ctx.stroke();
  ctx.restore();
}

// Стоимость призыва и активации
function renderCostBadges(ctx, cardData, layout) {
  const { cost, activation } = layout;
  const summonCost = cardData.cost ?? 0;

  drawManaOrbIcon(ctx, cost.cx, cost.cy, cost.size);
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${cost.font}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(summonCost), cost.cx, cost.cy);
  ctx.restore();

  if (cardData.locked) {
    drawLockIcon(ctx, cost.cx + cost.size * 0.75, cost.cy - cost.size * 0.35, cost.lockSize);
  }

  if (cardData.type === 'UNIT') {
    const activationCost = cardData.activation != null ? cardData.activation : Math.max(0, summonCost - 1);
    const badgeRadius = activation.size * 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.beginPath();
    ctx.arc(activation.cx, activation.cy, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawPlayIcon(ctx, activation.cx, activation.cy, activation.size);
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${activation.font}px "Arial", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(activationCost), activation.cx + activation.size * 0.6, activation.cy);
    ctx.restore();
  }
}

// Центральная иллюстрация
function renderIllustration(ctx, cardData, layout) {
  const art = layout.art;
  ctx.save();
  drawRoundedRectPath(ctx, art.x, art.y, art.w, art.h, art.radius);
  ctx.fillStyle = 'rgba(15,23,42,0.65)';
  ctx.fill();
  ctx.clip();

  const img = ensureCardIllustration(cardData);
  if (img) {
    const ratio = img.width / img.height;
    let w = art.w;
    let h = art.h;
    if (w / h > ratio) { w = h * ratio; } else { h = w / ratio; }
    const dx = art.x + (art.w - w) / 2;
    const dy = art.y + (art.h - h) / 2;
    try { ctx.drawImage(img, dx, dy, w, h); } catch {}
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${layout.px(10)}px "Arial", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ILLUSTRATION', art.x + art.w / 2, art.y + art.h / 2);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = Math.max(layout.px(2), 1.5);
  drawRoundedRectPath(ctx, art.x, art.y, art.w, art.h, art.radius);
  ctx.stroke();
  ctx.restore();
}

// Текстовая область и схемы атаки
function renderCardTextAndGrids(ctx, cardData, layout) {
  const isUnit = cardData.type === 'UNIT';
  const textBoxWidth = isUnit ? layout.body.textColumnWidth : layout.body.width;
  const textInnerWidth = isUnit ? layout.body.textInnerWidth : layout.body.fullInnerWidth;
  const textBoxHeight = Math.max(layout.px(60), layout.footer.top - layout.body.y - layout.body.padding / 2);

  ctx.save();
  drawRoundedRectPath(ctx, layout.body.x, layout.body.y, textBoxWidth, textBoxHeight, layout.px(8));
  ctx.fillStyle = 'rgba(15,23,42,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = Math.max(layout.px(1.1), 1);
  ctx.stroke();
  ctx.restore();

  const textStartX = layout.body.x + layout.body.padding;
  let textCursorY = layout.body.y + layout.body.padding;
  const typeLabel = isUnit
    ? 'CREATURE'
    : (cardData.spellType ? `${cardData.spellType.toUpperCase()} SPELL` : 'SPELL');

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(148,163,184,0.85)';
  ctx.font = `600 ${layout.body.labelFont}px "Arial", sans-serif`;
  ctx.fillText(typeLabel, textStartX, textCursorY);
  textCursorY += layout.body.labelFont + layout.body.padding * 0.6;

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `400 ${layout.body.fontSize}px "Arial", sans-serif`;
  let rulesText = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  if (cardData.ritualCost) {
    const ritualLine = `Ritual: ${cardData.ritualCost}`;
    rulesText = rulesText ? `${rulesText}\n${ritualLine}` : ritualLine;
  }
  const availableHeight = layout.footer.top - textCursorY - layout.body.padding;
  const maxLines = Math.max(1, Math.floor(availableHeight / layout.body.lineHeight));
  wrapText(ctx, rulesText, textStartX, textCursorY, textInnerWidth, layout.body.lineHeight, maxLines);
  ctx.restore();

  if (!isUnit) return;

  const grid = layout.grid;
  const blockSize = grid.width;
  const blockPadding = grid.padding;
  const blockHeight = blockSize + blockPadding * 2;
  const blockRadius = layout.px(6);
  const firstBgX = grid.x - blockPadding;
  const secondBgX = grid.secondX - blockPadding;
  const gridBgY = grid.y - blockPadding;

  ctx.save();
  drawRoundedRectPath(ctx, firstBgX, gridBgY, blockSize + blockPadding * 2, blockHeight, blockRadius);
  ctx.fillStyle = 'rgba(15,23,42,0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.stroke();
  drawRoundedRectPath(ctx, secondBgX, gridBgY, blockSize + blockPadding * 2, blockHeight, blockRadius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(148,163,184,0.85)';
  ctx.font = `600 ${grid.labelFont}px "Arial", sans-serif`;
  ctx.fillText('ATTACK', grid.x + blockSize / 2, grid.y - blockPadding / 2);
  ctx.fillText('BLIND', grid.secondX + blockSize / 2, grid.y - blockPadding / 2);
  ctx.restore();

  drawAttacksGrid(ctx, cardData, grid.x, grid.y, grid.cell, grid.gap);
  drawBlindspotGrid(ctx, cardData, grid.secondX, grid.y, grid.cell, grid.gap);
}

// Нижняя панель со стоимостью и статами
function renderFooter(ctx, cardData, layout, hpOverride, atkOverride) {
  const footer = layout.footer;
  const baseY = footer.top;
  const gradient = ctx.createLinearGradient(0, baseY, 0, baseY + footer.height);
  gradient.addColorStop(0, 'rgba(15,23,42,0.9)');
  gradient.addColorStop(1, 'rgba(2,6,23,0.95)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, baseY, layout.width, footer.height);

  const centerY = footer.centerY;
  const costValue = cardData.cost ?? 0;
  const orbCenterX = footer.paddingX + footer.icon / 2;
  drawManaOrbIcon(ctx, orbCenterX, centerY, footer.icon);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${footer.font}px "Arial", sans-serif`;
  let cursorX = orbCenterX + footer.icon / 2 + layout.px(6);
  ctx.fillText(String(costValue), cursorX, centerY);
  let offset = ctx.measureText(String(costValue)).width;

  if (cardData.locked) {
    drawLockIcon(ctx, cursorX + offset + footer.icon * 0.6, centerY, footer.icon * 0.9);
    offset += footer.icon * 0.9 + layout.px(4);
  }

  if (cardData.type === 'UNIT') {
    const activationCost = cardData.activation != null ? cardData.activation : Math.max(0, costValue - 1);
    const iconCenterX = cursorX + offset + footer.icon / 2 + layout.px(16);
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.beginPath();
    ctx.arc(iconCenterX, centerY, footer.icon / 2, 0, Math.PI * 2);
    ctx.fill();
    drawPlayIcon(ctx, iconCenterX, centerY, footer.icon);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(activationCost), iconCenterX + footer.icon / 2 + layout.px(4), centerY);
  } else if (cardData.spellType) {
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = `600 ${footer.labelFont}px "Arial", sans-serif`;
    cursorX += offset + layout.px(16);
    ctx.fillText(cardData.spellType.toUpperCase(), cursorX, centerY);
  }
  ctx.restore();

  if (cardData.type !== 'UNIT') return;

  const atkValue = atkOverride != null ? atkOverride : (cardData.atk || 0);
  const hpValue = hpOverride != null ? hpOverride : (cardData.hp || 0);

  const hpCenterX = layout.width - footer.paddingX - footer.blockWidth / 2;
  const atkCenterX = hpCenterX - footer.blockWidth - footer.blockGap;

  drawStatBlock(ctx, 'ATK', atkValue, atkCenterX, centerY, '#f97316', layout, footer);
  drawStatBlock(ctx, 'HP', hpValue, hpCenterX, centerY, '#38bdf8', layout, footer);
}

// Бэйдж статистики (ATK/HP)
function drawStatBlock(ctx, label, value, centerX, centerY, color, layout, footer) {
  const w = footer.blockWidth;
  const h = footer.blockHeight;
  const radius = layout.px(8);
  const x = centerX - w / 2;
  const y = centerY - h / 2;

  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, 'rgba(15,23,42,0.92)');
  gradient.addColorStop(1, 'rgba(30,41,59,0.88)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(layout.px(2), 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `600 ${footer.labelFont}px "Arial", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(label, centerX, y + layout.px(4));

  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${footer.atkHpFont}px "Arial", sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(String(value), centerX, y + h - layout.px(4));
  ctx.restore();
}

// Универсальная функция для скруглённых прямоугольников
function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
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

// Загрузка иллюстрации карты и кеширование
function ensureCardIllustration(cardData) {
  if (!cardData) return null;
  const id = cardData.id;
  const fallback = (cardData.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '_');
  let img = CARD_IMAGES[id] || CARD_IMAGES[id?.toLowerCase?.()] || CARD_IMAGES[fallback];
  if (!img && id && !CARD_PENDING[id]) {
    CARD_PENDING[id] = true;
    const candidates = [
      `card images/${id}.png`,
      `card images/${String(id).toLowerCase()}.png`,
      `card images/${fallback}.png`,
      `card images/${fallback.replace(/_/g, '-')}.png`,
    ];
    (function tryLoad(i) {
      if (i >= candidates.length) { CARD_PENDING[id] = false; return; }
      const im = new Image();
      im.onload = () => {
        CARD_IMAGES[id] = im;
        CARD_PENDING[id] = false;
        try { if (typeof window !== 'undefined' && window.requestCardsRedraw) window.requestCardsRedraw(); } catch {}
      };
      im.onerror = () => tryLoad(i + 1);
      im.src = encodeURI(candidates[i]);
    })(0);
  }
  if (img && img.complete && !(typeof location !== 'undefined' && location.protocol === 'file:')) {
    return img;
  }
  return null;
}

// Форматирование текста с ограничением по ширине и числу строк
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  if (!text) return;
  const lines = computeWrappedLines(ctx, text, maxWidth);
  if (!lines.length) return;
  const limit = Math.min(lines.length, maxLines);
  const ellipsisNeeded = lines.length > maxLines;
  const ellipsis = '…';
  for (let i = 0; i < limit; i++) {
    let line = lines[i];
    if (ellipsisNeeded && i === limit - 1) {
      while (ctx.measureText(line + ellipsis).width > maxWidth && line.length > 0) {
        line = line.slice(0, -1).trimEnd();
      }
      line += ellipsis;
    }
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function computeWrappedLines(ctx, text, maxWidth) {
  const result = [];
  const paragraphs = String(text).split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

function getElementColor(element) {
  const colors = {
    FIRE: '#dc2626',
    WATER: '#0369a1',
    EARTH: '#525252',
    FOREST: '#166534',
    BIOLITH: '#64748b',
    NEUTRAL: '#64748b',
  };
  return colors[element] || colors.NEUTRAL;
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
  const sh = r;
  ctx.beginPath();
  ctx.moveTo(r * 0.5, sh);
  ctx.lineTo(r * 0.5, sh * 0.3);
  ctx.quadraticCurveTo(r, 0, r * 1.5, sh * 0.3);
  ctx.lineTo(r * 1.5, sh);
  ctx.stroke();
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
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(r, bodyY + bodyH / 2, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAttacksGrid(ctx, cardData, x, y, cell, gap) {
  const attacks = cardData.attacks || [];
  const baseStroke = Math.max(1, Math.round(cell * 0.1));
  const highlightStroke = Math.max(1, Math.round(cell * 0.18));

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      const isCenter = r === 1 && c === 1;
      ctx.fillStyle = isCenter ? 'rgba(15,23,42,0.92)' : 'rgba(30,41,59,0.62)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx.lineWidth = baseStroke;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }

  if (cardData.attackType === 'MAGIC') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue;
        const cx = x + c * (cell + gap);
        const cy = y + r * (cell + gap);
        ctx.fillStyle = 'rgba(56,189,248,0.25)';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = 'rgba(56,189,248,0.7)';
        ctx.lineWidth = highlightStroke;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      }
    }
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = highlightStroke;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    return;
  }

  const map = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
  for (const attack of attacks) {
    const isChoice = cardData.chooseDir || attack.mode === 'ANY';
    const minDist = Math.min(...(attack.ranges || [1]));
    for (const dist of attack.ranges || []) {
      const vec = map[attack.dir];
      if (!vec) continue;
      const rr = 1 + vec[0] * dist;
      const cc = 1 + vec[1] * dist;
      const cx = x + cc * (cell + gap);
      const cy = y + rr * (cell + gap);
      ctx.fillStyle = 'rgba(56,189,248,0.25)';
      ctx.fillRect(cx, cy, cell, cell);
      const multi = (!attack.mode || attack.mode !== 'ANY') && attack.ranges && attack.ranges.length > 1;
      const mustHit = (!isChoice) && (multi || dist === minDist);
      ctx.strokeStyle = mustHit ? '#ef4444' : 'rgba(56,189,248,0.65)';
      ctx.lineWidth = highlightStroke;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    }
  }

  if (cardData.chooseDir || attacks.some(a => a.mode === 'ANY')) {
    const cx = x + 1 * (cell + gap);
    const cy = y + 0 * (cell + gap);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = highlightStroke;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  }
}

function drawBlindspotGrid(ctx, cardData, x, y, cell, gap) {
  const blind = Array.isArray(cardData.blindspots) && cardData.blindspots.length ? cardData.blindspots : ['S'];
  const baseStroke = Math.max(1, Math.round(cell * 0.1));
  const highlightStroke = Math.max(1, Math.round(cell * 0.18));

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      const isCenter = r === 1 && c === 1;
      ctx.fillStyle = isCenter ? 'rgba(251,191,36,0.55)' : 'rgba(30,41,59,0.62)';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx.lineWidth = baseStroke;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
      const isN = r === 0 && c === 1;
      const isE = r === 1 && c === 2;
      const isS = r === 2 && c === 1;
      const isW = r === 1 && c === 0;
      if ((isN && blind.includes('N')) || (isE && blind.includes('E')) || (isS && blind.includes('S')) || (isW && blind.includes('W'))) {
        ctx.fillStyle = 'rgba(59,130,246,0.25)';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = 'rgba(59,130,246,0.75)';
        ctx.lineWidth = highlightStroke;
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
  const img = ensureCardIllustration(cardData);
  const W = BASE_CARD_SIZE.WIDTH;
  const H = BASE_CARD_SIZE.HEIGHT;
  const illX = 26, illY = 60, illW = W - 52, illH = 138;
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

