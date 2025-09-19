// Управление всплывающей подсказкой с количеством оставшихся попыток Dodge
const HOVER_DELAY_MS = 1000;
let hoverTimer = null;
let pendingInfo = null;
let visibleInfo = null;
let lastPointer = { x: 0, y: 0 };

function getTooltipEl() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dodge-tooltip');
}

function clearTimer() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function hideTooltip() {
  const tip = getTooltipEl();
  if (!tip) return;
  tip.classList.add('hidden');
  tip.textContent = '';
}

function updateTooltipPosition() {
  if (!visibleInfo) return;
  const tip = getTooltipEl();
  if (!tip) return;
  tip.style.left = `${lastPointer.x}px`;
  tip.style.top = `${lastPointer.y}px`;
}

function showTooltip(info) {
  const tip = getTooltipEl();
  if (!tip) return;
  tip.textContent = info.text;
  tip.style.left = `${lastPointer.x}px`;
  tip.style.top = `${lastPointer.y}px`;
  tip.classList.remove('hidden');
}

function recordPointer(event) {
  if (!event) return;
  lastPointer = {
    x: event.clientX + 16,
    y: event.clientY + 16,
  };
}

function computeDodgeInfo(mesh) {
  if (!mesh || typeof window === 'undefined') return null;
  const r = mesh.userData?.row;
  const c = mesh.userData?.col;
  if (r == null || c == null) return null;
  const board = window.gameState?.board;
  const unit = board?.[r]?.[c]?.unit;
  if (!unit) return null;
  const state = unit.dodgeState;
  if (!state) return null;
  if (state.limited) {
    const remaining = Math.max(0, Number(state.remaining ?? state.max ?? 0));
    if (remaining <= 0) return null;
    return { key: `${r},${c}`, text: `Dodge: ${remaining} attempts` };
  }
  return { key: `${r},${c}`, text: 'Dodge: ∞ attempts' };
}

export function scheduleDodgeTooltip(mesh, event) {
  if (!mesh || typeof window === 'undefined') {
    cancelDodgeTooltip();
    return;
  }
  recordPointer(event);
  const info = computeDodgeInfo(mesh);
  if (!info) {
    cancelDodgeTooltip();
    return;
  }

  if (visibleInfo && visibleInfo.key === info.key) {
    if (visibleInfo.text !== info.text) {
      visibleInfo.text = info.text;
      showTooltip(visibleInfo);
    } else {
      updateTooltipPosition();
    }
    return;
  }

  if (pendingInfo && pendingInfo.key === info.key) {
    pendingInfo.text = info.text;
    return;
  }

  if (visibleInfo && visibleInfo.key !== info.key) {
    hideTooltip();
    visibleInfo = null;
  }

  clearTimer();
  pendingInfo = { ...info };
  hoverTimer = setTimeout(() => {
    if (!pendingInfo || pendingInfo.key !== info.key) return;
    showTooltip(pendingInfo);
    visibleInfo = { ...pendingInfo };
    pendingInfo = null;
    clearTimer();
  }, HOVER_DELAY_MS);
}

export function updateDodgeTooltipPosition(event) {
  if (!visibleInfo && !pendingInfo) return;
  recordPointer(event);
  if (visibleInfo) {
    updateTooltipPosition();
  }
}

export function cancelDodgeTooltip() {
  clearTimer();
  pendingInfo = null;
  if (visibleInfo) {
    hideTooltip();
    visibleInfo = null;
  }
}
