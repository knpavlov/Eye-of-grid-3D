// Визуальные оверлеи для отображения текущего числа попыток Dodge на клетках
// Логика изолирована, чтобы можно было переиспользовать подсказки при миграции
// на другие движки (например, Unity)

import { getCtx } from './context.js';

function ensureStore() {
  const ctx = getCtx();
  if (!Array.isArray(ctx.dodgeOverlays)) {
    ctx.dodgeOverlays = Array.from({ length: 3 }, () => Array(3).fill(null));
  }
  return ctx.dodgeOverlays;
}

function disposeOverlay(sprite) {
  if (!sprite) return;
  try {
    if (sprite.parent) {
      sprite.parent.remove(sprite);
    }
  } catch {}
  try {
    sprite.material?.map?.dispose?.();
  } catch {}
  try {
    sprite.material?.dispose?.();
  } catch {}
}

function formatAttempts(unit) {
  const state = unit?.dodgeState;
  if (!state) {
    return '0';
  }
  if (!state.limited) {
    return '∞';
  }
  const remaining = (typeof state.remaining === 'number')
    ? state.remaining
    : (typeof state.max === 'number' ? state.max : (typeof state.successes === 'number' ? state.successes : 0));
  return String(Math.max(0, remaining));
}

function createTexture(text, THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx2d.strokeStyle = 'rgba(59, 130, 246, 0.85)';
  ctx2d.lineWidth = 6;
  const radius = 28;
  const w = canvas.width;
  const h = canvas.height;
  ctx2d.beginPath();
  ctx2d.moveTo(radius, 0);
  ctx2d.lineTo(w - radius, 0);
  ctx2d.quadraticCurveTo(w, 0, w, radius);
  ctx2d.lineTo(w, h - radius);
  ctx2d.quadraticCurveTo(w, h, w - radius, h);
  ctx2d.lineTo(radius, h);
  ctx2d.quadraticCurveTo(0, h, 0, h - radius);
  ctx2d.lineTo(0, radius);
  ctx2d.quadraticCurveTo(0, 0, radius, 0);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.stroke();

  ctx2d.font = 'bold 44px "Inter", "Arial", sans-serif';
  ctx2d.fillStyle = '#f8fafc';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSprite(text, THREE) {
  const texture = createTexture(text, THREE);
  if (!texture) return null;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 1.1, 1);
  sprite.center.set(1, 1);
  sprite.renderOrder = 2500;
  sprite.userData = { kind: 'dodgeOverlay', text };
  return sprite;
}

function updateSpriteText(sprite, text, THREE) {
  if (!sprite || sprite.userData?.text === text) return;
  const oldTex = sprite.material?.map || null;
  const texture = createTexture(text, THREE);
  if (texture) {
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
    sprite.userData.text = text;
  }
  if (oldTex) {
    try { oldTex.dispose(); } catch {}
  }
}

function positionSprite(sprite, tile) {
  if (!sprite || !tile) return;
  const width = tile.geometry?.parameters?.width ?? 6.2;
  const height = tile.geometry?.parameters?.height ?? 0.35;
  const depth = tile.geometry?.parameters?.depth ?? width;
  const marginX = 0.7;
  const marginZ = 0.7;
  const yOffset = height / 2 + 0.9;
  sprite.position.set(width / 2 - marginX, yOffset, -depth / 2 + marginZ);
}

export function updateDodgeOverlays(gameState) {
  const ctx = getCtx();
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  if (!THREE) return;
  const tiles = ctx.tileMeshes || [];
  if (!tiles.length) return;
  const store = ensureStore();

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const tile = tiles?.[r]?.[c] || null;
      const sprite = store[r][c];
      const cell = gameState?.board?.[r]?.[c];
      const unit = cell?.unit;
      if (!tile || !unit) {
        if (sprite) {
          disposeOverlay(sprite);
          store[r][c] = null;
        }
        continue;
      }
      const attemptsText = `Dodge: ${formatAttempts(unit)} attempts`;
      if (!sprite) {
        const created = createSprite(attemptsText, THREE);
        if (!created) continue;
        positionSprite(created, tile);
        tile.add(created);
        store[r][c] = created;
      } else {
        updateSpriteText(sprite, attemptsText, THREE);
        if (sprite.parent !== tile) {
          try { sprite.parent?.remove(sprite); } catch {}
          tile.add(sprite);
        }
        positionSprite(sprite, tile);
      }
    }
  }
}

export function clearDodgeOverlays() {
  const ctx = getCtx();
  if (!Array.isArray(ctx.dodgeOverlays)) return;
  for (let r = 0; r < ctx.dodgeOverlays.length; r++) {
    const row = ctx.dodgeOverlays[r] || [];
    for (let c = 0; c < row.length; c++) {
      disposeOverlay(row[c]);
      row[c] = null;
    }
  }
  ctx.dodgeOverlays = Array.from({ length: 3 }, () => Array(3).fill(null));
}
