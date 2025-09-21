// Board construction and materials
import { getCtx } from './context.js';

const BASE_MAP = {
  FIRE: './textures/tile_fire.png',
  WATER: './textures/tile_water.png',
  EARTH: './textures/tile_earth.png',
  FOREST: './textures/tile_forest.png',
  BIOLITH: './textures/tile_biolith.png',
};

const SIDE_TEXTURE_PATH = './textures/Field_side.PNG';
const SIDE_TEXTURE_VERSION = '1';
const SIDE_FACE_INDICES = [0, 1, 4, 5];
const TOP_FACE_INDEX = 2;
const BOTTOM_FACE_INDEX = 3;

let isSideTextureLoading = false;

function loadBaseTileTextures() {
  const ctx = getCtx();
  const { THREE, renderer, TILE_TEXTURES } = ctx;
  if (!THREE) return;
  const loader = new THREE.TextureLoader();
  const ASSET_VERSION = '2';
  for (const k in BASE_MAP) {
    if (TILE_TEXTURES[k]) continue;
    const path = `${BASE_MAP[k]}?v=${ASSET_VERSION}`;
    try {
      loader.load(
        path,
        (tex) => {
          try {
            tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 1);
            tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            ctx.TILE_TEXTURES[k] = tex; tex.needsUpdate = true;
            // Update any tiles of this element key once the texture is ready
            try { updateTileMaterialsFor(k); } catch {}
          } catch {}
        },
        undefined,
        () => { /* ignore load error; procedural fallback handles it */ }
      );
    } catch {}
  }
}

function configureSideTexture(tex) {
  const ctx = getCtx();
  const { THREE, renderer } = ctx;
  if (!tex || !THREE) return;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  try { tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1; } catch {}
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
}

function loadTileSideTexture() {
  const ctx = getCtx();
  const { THREE, TILE_SIDE_TEXTURE } = ctx;
  if (!THREE) return null;
  if (TILE_SIDE_TEXTURE && TILE_SIDE_TEXTURE.image && TILE_SIDE_TEXTURE.image.width) return TILE_SIDE_TEXTURE;
  if (isSideTextureLoading) return TILE_SIDE_TEXTURE;
  const loader = new THREE.TextureLoader();
  const path = `${SIDE_TEXTURE_PATH}?v=${SIDE_TEXTURE_VERSION}`;
  isSideTextureLoading = true;
  const texture = loader.load(
    path,
    (tex) => {
      try { configureSideTexture(tex); } catch {}
      ctx.TILE_SIDE_TEXTURE = tex;
      isSideTextureLoading = false;
      try { refreshTileSideMaterials(); } catch {}
    },
    undefined,
    () => { isSideTextureLoading = false; }
  );
  if (!ctx.TILE_SIDE_TEXTURE) ctx.TILE_SIDE_TEXTURE = texture;
  return ctx.TILE_SIDE_TEXTURE;
}

function createSideMaterial() {
  const ctx = getCtx();
  const { THREE, TILE_SIDE_TEXTURE } = ctx;
  if (!THREE) return null;
  const ready = TILE_SIDE_TEXTURE && TILE_SIDE_TEXTURE.image && TILE_SIDE_TEXTURE.image.width;
  if (ready) {
    const mat = new THREE.MeshBasicMaterial({ map: TILE_SIDE_TEXTURE });
    mat.needsUpdate = true;
    return mat;
  }
  const fallback = new THREE.MeshBasicMaterial({ color: 0x1f2937 });
  fallback.needsUpdate = true;
  return fallback;
}

function createBottomMaterial() {
  const ctx = getCtx();
  const { THREE } = ctx;
  if (!THREE) return null;
  const mat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  mat.needsUpdate = true;
  return mat;
}

function disposeMaterialsAtIndices(materials, indices) {
  const disposed = new Set();
  for (const index of indices) {
    const mat = materials[index];
    if (!mat || disposed.has(mat)) continue;
    try { mat.dispose && mat.dispose(); } catch {}
    disposed.add(mat);
  }
}

function buildTileMaterials(element) {
  const topMaterial = getTileMaterial(element);
  const sideMaterial = createSideMaterial();
  const bottomMaterial = createBottomMaterial();
  const materials = new Array(6);

  const baseSide = sideMaterial;
  SIDE_FACE_INDICES.forEach((faceIndex, idx) => {
    if (!baseSide) return;
    materials[faceIndex] = idx === 0 ? baseSide : baseSide.clone();
    materials[faceIndex].needsUpdate = true;
  });

  if (topMaterial) {
    materials[TOP_FACE_INDEX] = topMaterial;
    materials[TOP_FACE_INDEX].needsUpdate = true;
  }

  if (bottomMaterial) {
    materials[BOTTOM_FACE_INDEX] = bottomMaterial;
    materials[BOTTOM_FACE_INDEX].needsUpdate = true;
  } else if (baseSide) {
    materials[BOTTOM_FACE_INDEX] = baseSide.clone();
  }

  // На случай отсутствия сайд-материала, заполняем базовым материалом
  for (let i = 0; i < materials.length; i++) {
    if (!materials[i] && topMaterial && topMaterial.clone) {
      materials[i] = topMaterial.clone();
      materials[i].needsUpdate = true;
    } else if (!materials[i]) {
      const fallback = createSideMaterial();
      materials[i] = fallback;
    }
  }

  return materials;
}

function refreshTileSideMaterials() {
  const ctx = getCtx();
  const { tileMeshes, TILE_SIDE_TEXTURE } = ctx;
  if (!tileMeshes || !tileMeshes.length) return;
  if (!TILE_SIDE_TEXTURE || !TILE_SIDE_TEXTURE.image || !TILE_SIDE_TEXTURE.image.width) return;
  for (const row of tileMeshes) {
    if (!row) continue;
    for (const tile of row) {
      if (!tile) continue;
      const materials = Array.isArray(tile.material) ? tile.material : [tile.material];
      disposeMaterialsAtIndices(materials, SIDE_FACE_INDICES);
      const baseSide = createSideMaterial();
      SIDE_FACE_INDICES.forEach((faceIndex, idx) => {
        const mat = idx === 0 ? baseSide : baseSide.clone();
        mat.needsUpdate = true;
        materials[faceIndex] = mat;
      });
      tile.material = materials;
    }
  }
}

export function createProceduralTileTexture(element) {
  const ctx = getCtx();
  const { THREE, renderer } = ctx;
  if (!THREE) return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const d = c.getContext('2d');
  d.clearRect(0,0,256,256);
  if (element === 'FIRE') {
    const grad = d.createLinearGradient(0,0,256,256);
    grad.addColorStop(0,'#7f1d1d'); grad.addColorStop(1,'#b91c1c'); d.fillStyle = grad; d.fillRect(0,0,256,256);
    d.globalAlpha = 0.2; d.fillStyle = '#ef4444';
    for (let i=0;i<6;i++){ d.beginPath(); d.moveTo(i*40,0); d.lineTo(i*40+20,0); d.lineTo(256,256); d.lineTo(i*40+10,256); d.closePath(); d.fill(); }
  } else if (element === 'WATER') {
    d.strokeStyle = '#22d3ee'; d.lineWidth = 3; d.globalAlpha = 0.7;
    for (let y=20; y<256; y+=24) { d.beginPath(); for (let x=0; x<=256; x+=8) { d.lineTo(x, y + Math.sin((x+y)/20)*6); } d.stroke(); }
  } else if (element === 'EARTH') {
    for (let y=0; y<256; y+=16) { for (let x=0; x<256; x+=16) {
      const v = 40 + Math.floor(Math.random()*30); d.fillStyle = `rgb(${v+60},${v+40},${v})`; d.fillRect(x,y,16,16);
    } }
  } else if (element === 'FOREST') {
    d.fillStyle = '#16a34a'; for (let i=0;i<180;i++){ const x=Math.random()*256, y=Math.random()*256, r=Math.random()*3+1; d.beginPath(); d.arc(x,y,r,0,Math.PI*2); d.fill(); }
    d.strokeStyle='#22c55e'; d.globalAlpha = 0.35; for (let i=0;i<40;i++){ d.beginPath(); d.moveTo(Math.random()*256, Math.random()*256); d.lineTo(Math.random()*256, Math.random()*256); d.stroke(); }
  } else if (element === 'BIOLITH') {
    d.globalAlpha = 0.6; d.strokeStyle = '#9ca3af'; d.lineWidth = 1.5;
    for (let y=16; y<256; y+=16) { d.beginPath(); d.moveTo(0,y); d.lineTo(256,y); d.stroke(); }
    for (let x=16; x<256; x+=16) { d.beginPath(); d.moveTo(x,0); d.lineTo(x,256); d.stroke(); }
    d.globalAlpha = 0.9; d.fillStyle = '#94a3b8'; for (let i=0;i<40;i++){ const x=Math.floor(Math.random()*16)*16+2; const y=Math.floor(Math.random()*16)*16+2; d.fillRect(x,y,2,2); }
  }
  const tex = new (getCtx().THREE).CanvasTexture(c);
  try { tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1; } catch {}
  tex.wrapS = (getCtx().THREE).RepeatWrapping; tex.wrapT = (getCtx().THREE).RepeatWrapping; tex.repeat.set(1,1);
  getCtx().PROC_TILE_TEXTURES[element] = tex;
  return tex;
}

const ELEMENT_BASE_COLORS = {
  FIRE: 0xdc2626,
  WATER: 0x0369a1,
  EARTH: 0x525252,
  FOREST: 0x166534,
  BIOLITH: 0x334155,
};

export function getTileMaterial(element) {
  const ctx = getCtx();
  const { THREE, TILE_TEXTURES, PROC_TILE_TEXTURES } = ctx;
  if (!THREE) return null;
  loadBaseTileTextures();
  let tex = TILE_TEXTURES[element];
  if (!tex || !tex.image || !tex.image.width) {
    tex = PROC_TILE_TEXTURES[element] || createProceduralTileTexture(element);
  }
  if (tex) return new THREE.MeshBasicMaterial({ map: tex });
  return new THREE.MeshStandardMaterial({
    color: ELEMENT_BASE_COLORS[element] || 0x64748b,
    metalness: 0.12,
    roughness: 0.6,
    emissive: 0x1a1a1a,
    emissiveIntensity: 0.18,
  });
}

export function updateTileMaterialsFor(elementKey) {
  const ctx = getCtx();
  const { TILE_TEXTURES, tileMeshes, THREE, renderer, scene, camera } = ctx;
  if (!tileMeshes || !tileMeshes.length) return;
  const tex = TILE_TEXTURES[elementKey]; if (!tex) return;
  for (let r = 0; r < tileMeshes.length; r++) {
    const row = tileMeshes[r] || [];
    for (let c = 0; c < row.length; c++) {
      const tile = row[c]; if (!tile) continue;
      const el = tile.userData && tile.userData.element;
      if (el !== elementKey) continue;
      if (!Array.isArray(tile.material) || tile.material.length < 6) {
        try { tile.material && tile.material.dispose && tile.material.dispose(); } catch {}
        tile.material = buildTileMaterials(el);
        continue;
      }
      const materials = tile.material;
      disposeMaterialsAtIndices(materials, [TOP_FACE_INDEX]);
      const topMaterial = new THREE.MeshBasicMaterial({ map: tex });
      topMaterial.needsUpdate = true;
      materials[TOP_FACE_INDEX] = topMaterial;
      tile.material = materials;
    }
  }
  try { renderer && renderer.render(scene, camera); } catch {}
}

export function createBoard(gameState) {
  const ctx = getCtx();
  const { THREE, boardGroup } = ctx;
  if (!THREE || !boardGroup || !gameState) return [];
  // Cleanup previous
  (ctx.tileMeshes || []).forEach(row => row && row.forEach(tile => { try { boardGroup.remove(tile); } catch {} }));
  (ctx.tileFrames || []).forEach(row => row && row.forEach(f => { try { boardGroup.remove(f); } catch {} }));
  ctx.tileMeshes = []; ctx.tileFrames = [];

  const tileSize = 6.2;
  const tileHeight = 0.35;
  const spacing = 0.2;
  const boardYOffset = 0.0;
  const boardZShift = -3.5;

  loadTileSideTexture();

  for (let r = 0; r < 3; r++) {
    const row = []; const frameRow = [];
    for (let c = 0; c < 3; c++) {
      const cell = gameState.board[r][c];
      const geometry = new THREE.BoxGeometry(tileSize, tileHeight, tileSize);
      const materials = buildTileMaterials(cell.element);
      const tile = new THREE.Mesh(geometry, materials);
      const x = (c - 1) * (tileSize + spacing);
      const z = (r - 1) * (tileSize + spacing) + boardZShift;
      tile.position.set(x, tileHeight / 2 + boardYOffset, z);
      tile.castShadow = false; tile.receiveShadow = true;
      tile.userData = { type: 'tile', row: r, col: c, element: cell.element };
      boardGroup.add(tile); row.push(tile);

      // Frame (thin borders)
      const frame = new THREE.Group();
      const borderT = 0.18; const h = 0.018;
      const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: true, depthWrite: false, opacity: 0.0 });
      const top    = new THREE.Mesh(new THREE.BoxGeometry(tileSize + 0.04, h, borderT), frameMat.clone());
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(tileSize + 0.04, h, borderT), frameMat.clone());
      const left   = new THREE.Mesh(new THREE.BoxGeometry(borderT, h, tileSize + 0.04), frameMat.clone());
      const right  = new THREE.Mesh(new THREE.BoxGeometry(borderT, h, tileSize + 0.04), frameMat.clone());
      top.position.set(x, tileHeight + boardYOffset + h/2 + 0.002, z - (tileSize/2 - borderT/2));
      bottom.position.set(x, tileHeight + boardYOffset + h/2 + 0.002, z + (tileSize/2 - borderT/2));
      left.position.set(x - (tileSize/2 - borderT/2), tileHeight + boardYOffset + h/2 + 0.002, z);
      right.position.set(x + (tileSize/2 - borderT/2), tileHeight + boardYOffset + h/2 + 0.002, z);
      for (const seg of [top, bottom, left, right]) { seg.renderOrder = 600; frame.add(seg); }
      frame.renderOrder = 800;
      boardGroup.add(frame); frameRow.push(frame);
    }
    ctx.tileMeshes.push(row);
    ctx.tileFrames.push(frameRow);
  }

  return ctx.tileMeshes;
}
