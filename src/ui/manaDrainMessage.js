// Отображение временного сообщения об утрате маны у конкретного игрока

const DEFAULT_DURATION = 2600;

// Храним активные таймеры, чтобы не накапливать несколько всплывающих окон
const activeMessages = new Map();

function ensureContainer() {
  if (typeof document === 'undefined') return null;
  const rootId = 'mana-drain-messages-root';
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.createElement('div');
    root.id = rootId;
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '130';
    document.body.appendChild(root);
  }
  return root;
}

function buildText(amount, sourceName) {
  const safeAmount = Math.max(0, Number.isFinite(amount) ? Math.floor(amount) : 0);
  const formatted = safeAmount > 0 ? `−${safeAmount} маны` : 'Мана утрачена';
  if (sourceName) {
    return `${sourceName}: ${formatted}`;
  }
  return formatted;
}

export function showManaDrainMessage(options = {}) {
  if (typeof document === 'undefined') return;
  const playerIndexRaw = options.playerIndex;
  if (!Number.isFinite(playerIndexRaw)) return;
  const playerIndex = Math.max(0, Math.min(1, Math.floor(playerIndexRaw)));

  const manaBar = document.getElementById(`mana-display-${playerIndex}`);
  if (!manaBar) return;

  const root = ensureContainer();
  if (!root) return;

  const existing = activeMessages.get(playerIndex);
  if (existing) {
    try { existing.cancel?.(); } catch {}
    try { existing.element?.parentNode?.removeChild(existing.element); } catch {}
    activeMessages.delete(playerIndex);
  }

  const rect = manaBar.getBoundingClientRect();
  const message = document.createElement('div');
  message.className = 'mana-drain-message';
  message.dataset.playerIndex = String(playerIndex);

  const sourceName = typeof options.sourceName === 'string' && options.sourceName.trim()
    ? options.sourceName.trim()
    : null;
  const text = typeof options.text === 'string' && options.text.trim()
    ? options.text.trim()
    : buildText(options.amount, sourceName);
  message.textContent = text;

  const offsetY = Number.isFinite(options.offsetY) ? options.offsetY : -32;
  const offsetX = Number.isFinite(options.offsetX) ? options.offsetX : 0;
  const left = rect.left + rect.width / 2 + offsetX;
  const top = rect.top + offsetY;
  message.style.left = `${left}px`;
  message.style.top = `${top}px`;

  root.appendChild(message);

  const animateIn = () => {
    try {
      message.classList.add('mana-drain-message--visible');
    } catch {}
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(animateIn));
  } else {
    setTimeout(animateIn, 16);
  }

  const duration = Number.isFinite(options.duration)
    ? Math.max(600, options.duration)
    : DEFAULT_DURATION;

  const cleanup = () => {
    try {
      message.classList.remove('mana-drain-message--visible');
      message.classList.add('mana-drain-message--hiding');
    } catch {}
    const removeDelay = 220;
    setTimeout(() => {
      try { message.parentNode?.removeChild(message); } catch {}
      if (activeMessages.get(playerIndex)?.element === message) {
        activeMessages.delete(playerIndex);
      }
    }, removeDelay);
  };

  const timeoutId = setTimeout(cleanup, duration);
  const cancel = () => {
    try { clearTimeout(timeoutId); } catch {}
    cleanup();
  };

  activeMessages.set(playerIndex, { element: message, cancel });

  return cancel;
}

export default { showManaDrainMessage };
