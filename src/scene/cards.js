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
  // Front background
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
  // Border + name
  const elementEmoji = (typeof window !== 'undefined' && window.elementEmoji) || {};
  ctx.strokeStyle = getElementColor(cardData.element);
  ctx.lineWidth = 4; ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 18px Arial, sans-serif'; ctx.textAlign = 'center';
  const name = (cardData.name || '').length > 20 ? (cardData.name || '').substring(0, 20) + '...' : (cardData.name || '');
  ctx.fillText(name, width / 2, 30);
  ctx.font = '24px Arial'; ctx.fillText(elementEmoji[cardData.element] || '', width / 2, 55);

  // Illustration frame
  const illX = 16, illY = 70, illW = width - 32, illH = 120;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'; ctx.fillRect(illX, illY, illW, illH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = 2; ctx.strokeRect(illX, illY, illW, illH);

  // Draw illustration if available (not on file://)
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
    let w = illW, h = illH; if (w / h > ar) { w = h * ar; } else { h = w / ar; }
    const dx = illX + (illW - w) / 2; const dy = illY + (illH - h) / 2;
    try { ctx.drawImage(img, dx, dy, w, h); } catch {}
  } else {
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px Arial'; ctx.fillText('Illustration', width / 2, 135);
  }

  // Text box
  ctx.fillStyle = '#cbd5e1'; ctx.font = '11px Arial'; ctx.textAlign = 'left';
  const text = cardData.desc || cardData.text || (cardData.keywords ? cardData.keywords.join(', ') : '');
  wrapText(ctx, text, 16, 210, width - 32, 14);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, height - 40, width, 40);
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
  const summonCostText = `\u20A9${cardData.cost || 0}`; // placeholder currency glyph
  ctx.fillText(summonCostText, 16, height - 15);
  if (cardData.type === 'UNIT') {
    ctx.textAlign = 'left'; ctx.font = 'bold 13px Arial';
    const act = (cardData.activation != null) ? cardData.activation : Math.max(0, (cardData.cost || 0) - 1);
    const shift = ctx.measureText(summonCostText).width + 10; ctx.fillText(`\u23F3${act}`, 16 + shift, height - 15);
  }
  if (cardData.type === 'UNIT') {
    ctx.textAlign = 'right';
    const hpToShow = (hpOverride != null) ? hpOverride : (cardData.hp || 0);
    const atkToShow = (atkOverride != null) ? atkOverride : (cardData.atk || 0);
    ctx.fillText(`\u2694${atkToShow}  \u2764${hpToShow}`, width - 16, height - 15);
    drawPatternGrid(ctx, cardData, width - 76, 178, 10, 2);
    drawBlindspotGrid(ctx, cardData, width - 36, 178, 10, 2);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return; const words = text.split(' '); let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine); const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; } else { line = testLine; }
  }
  ctx.fillText(line, x, y);
}

function getElementColor(element) {
  const colors = { FIRE: '#dc2626', WATER: '#0369a1', EARTH: '#525252', FOREST: '#166534' };
  return colors[element] || '#64748b';
}

function drawPatternGrid(ctx, cardData, x, y, cell, gap) {
  const dirsForPattern = (typeof window !== 'undefined' && window.dirsForPattern) || (()=>['N']);
  const pattern = cardData.pattern || 'FRONT';
  const range = cardData.range || 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap); const cy = y + r * (cell + gap);
      ctx.fillStyle = 'rgba(148,163,184,0.35)'; if (r === 1 && c === 1) ctx.fillStyle = 'rgba(250,204,21,0.7)';
      ctx.fillRect(cx, cy, cell, cell);
      const dirs = dirsForPattern('N', pattern);
      const isN = (r === 0 && c === 1), isE = (r === 1 && c === 2), isS = (r === 2 && c === 1), isW = (r === 1 && c === 0);
      if ((isN && dirs.includes('N')) || (isE && dirs.includes('E')) || (isS && dirs.includes('S')) || (isW && dirs.includes('W'))) {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.strokeRect(cx+0.5, cy+0.5, cell-1, cell-1);
      }
    }
  }
  if (range > 1) { ctx.fillStyle = 'rgba(148,163,184,0.5)'; ctx.fillRect(x + 1*(cell+gap) + 0.5, y + 1*(cell+gap) + 2, cell-1, cell-1); }
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
try { if (typeof window !== 'undefined') { window.__cards = { getCachedTexture, preloadCardTextures, createCard3D, drawCardFace, CARD_TEX, CARD_IMAGES }; } } catch {}

