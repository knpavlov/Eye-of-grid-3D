// Управление всплывающей подсказкой hover-tooltip
const entries = new Map();

function getTooltipElement() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('hover-tooltip');
}

function renderTooltip() {
  const el = getTooltipElement();
  if (!el) return;
  if (!entries.size) {
    el.classList.add('hidden');
    el.innerHTML = '';
    delete el.dataset.variant;
    return;
  }
  let latest = null;
  for (const entry of entries.values()) {
    if (!latest || entry.timestamp >= latest.timestamp) {
      latest = entry;
    }
  }
  if (!latest) {
    el.classList.add('hidden');
    return;
  }
  if (latest.variant) {
    el.dataset.variant = latest.variant;
  } else {
    delete el.dataset.variant;
  }
  if (typeof latest.html === 'string') {
    el.innerHTML = latest.html;
  } else {
    el.textContent = latest.text;
  }
  el.style.left = `${latest.x}px`;
  el.style.top = `${latest.y}px`;
  el.classList.remove('hidden');
}

export function showTooltip(source, { text, html, x, y, variant } = {}) {
  if (!source) return;
  entries.set(source, {
    text: String(text ?? ''),
    html: typeof html === 'string' ? html : null,
    x: Math.round(x ?? 0),
    y: Math.round(y ?? 0),
    timestamp: Date.now(),
    variant: variant || null,
  });
  renderTooltip();
}

export function hideTooltip(source) {
  if (!source) return;
  entries.delete(source);
  renderTooltip();
}
