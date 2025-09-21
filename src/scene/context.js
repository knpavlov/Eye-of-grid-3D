// Shared THREE.js scene context used by scene modules
// This module does NOT create a renderer by itself; see initThreeJS in index.js

const ctx = {
  // THREE primitives
  THREE: (typeof window !== 'undefined' ? window.THREE : undefined),
  renderer: null,
  scene: null,
  camera: null,
  raycaster: null,
  mouse: null,
  // Groups
  boardGroup: null,
  cardGroup: null,
  effectsGroup: null,
  metaGroup: null,
  // Board caches (module-local, but exposed for convenience)
  tileMeshes: [],
  tileFrames: [],
  // Scene caches for units and hand cards
  unitMeshes: [],
  unitMeshesByUid: new Map(),
  handCardMeshes: [],
  // Textures cache
  TILE_TEXTURES: {},
  PROC_TILE_TEXTURES: {},
  TILE_SIDE_TEXTURE: null,
};

export function getCtx() { return ctx; }

export function setTHREE(THREE) {
  ctx.THREE = THREE;
}

