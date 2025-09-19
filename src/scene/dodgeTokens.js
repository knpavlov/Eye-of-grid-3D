// Визуальные бейджи, показывающие количество попыток Dodge у существа на клетке
import { getCtx } from './context.js';

function getTHREE() {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) throw new Error('THREE не доступен для dodgeTokens');
  return THREE;
}

function ensureStorage() {
  const ctx = getCtx();
  if (!ctx.dodgeBadges) {
    ctx.dodgeBadges = Array.from({ length: 3 }, () => Array(3).fill(null));
  }
  return ctx.dodgeBadges;
}

function createBadge() {
  const THREE = getTHREE();
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx2d = canvas.getContext('2d');
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 1.3, 1);
  sprite.renderOrder = 1200;
  sprite.visible = false;
  sprite.userData = {
    canvas,
    ctx2d,
    texture,
    lastText: null,
  };
  return sprite;
}

function ensureBadge(r, c) {
  const store = ensureStorage();
  if (!store[r][c]) {
    const badge = createBadge();
    try {
      const ctx = getCtx();
      ctx.metaGroup?.add(badge) ?? ctx.boardGroup?.add(badge);
    } catch {}
    store[r][c] = badge;
  }
  return store[r][c];
}

function drawBadge(badge, text) {
  if (!badge) return;
  const { canvas, ctx2d, texture, lastText } = badge.userData || {};
  if (!ctx2d || !canvas || !texture) return;
  if (lastText === text) return;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.9)';
  ctx2d.lineWidth = 3;
  ctx2d.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx2d.font = '600 30px "Noto Sans", "Helvetica", sans-serif';
  ctx2d.fillStyle = '#e0f2fe';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
  badge.userData.lastText = text;
}

function computeAttempts(unit) {
  if (!unit) return { text: '', visible: false };
  const state = unit.dodgeState;
  if (!state) {
    return { text: 'Dodge: 0 attempts', visible: true };
  }
  if (!state.limited) {
    return { text: 'Dodge: ∞ attempts', visible: true };
  }
  const remaining = Math.max(0, Number(state.remaining ?? state.max ?? 0));
  return { text: `Dodge: ${remaining} attempts`, visible: true };
}

export function updateDodgeTokens(gameState) {
  if (!gameState?.board) return;
  const ctx = getCtx();
  const tiles = ctx.tileMeshes || [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const tile = tiles?.[r]?.[c];
      const badge = ensureBadge(r, c);
      const cell = gameState.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!tile || !badge || !unit) {
        if (badge) badge.visible = false;
        continue;
      }

      const info = computeAttempts(unit);
      badge.visible = info.visible;
      if (!info.visible) continue;
      drawBadge(badge, info.text);

      const width = tile.geometry?.parameters?.width ?? 6.2;
      const height = tile.geometry?.parameters?.height ?? 0.35;
      const offsetX = width / 2 - 0.8;
      const offsetZ = -(width / 2 - 0.8);
      const yOffset = height + 1.4;
      badge.position.set(
        tile.position.x + offsetX,
        tile.position.y + yOffset,
        tile.position.z + offsetZ,
      );
    }
  }
}
