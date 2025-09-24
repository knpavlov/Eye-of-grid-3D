// Управление всплывающей подсказкой hover-tooltip
const entries = new Map();
let activeExtraClasses = [];

function getTooltipElement() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('hover-tooltip');
}

function applyExtraClasses(el, className) {
  const next = typeof className === 'string'
    ? className.split(/\s+/).map(cls => cls.trim()).filter(Boolean)
    : [];
  for (const cls of activeExtraClasses) {
    if (!next.includes(cls)) {
      try { el.classList.remove(cls); } catch {}
    }
  }
  for (const cls of next) {
    if (!activeExtraClasses.includes(cls)) {
      try { el.classList.add(cls); } catch {}
    }
  }
  activeExtraClasses = next;
}

function renderTooltip() {
  const el = getTooltipElement();
  if (!el) return;
  if (!entries.size) {
    el.classList.add('hidden');
    applyExtraClasses(el, '');
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
    applyExtraClasses(el, '');
    return;
  }
  if (latest.html != null) {
    el.innerHTML = String(latest.html);
  } else {
    el.textContent = String(latest.text ?? '');
  }
  el.style.left = `${Math.round(latest.x ?? 0)}px`;
  el.style.top = `${Math.round(latest.y ?? 0)}px`;
  applyExtraClasses(el, latest.className || '');
  el.classList.remove('hidden');
}

export function showTooltip(source, { text, html, x, y, className }) {
  if (!source) return;
  const entry = {
    text: text != null ? String(text) : '',
    html: html != null ? html : null,
    x: Math.round(x ?? 0),
    y: Math.round(y ?? 0),
    className: typeof className === 'string' ? className : '',
    timestamp: Date.now(),
  };
  entries.set(source, entry);
  renderTooltip();
}

export function hideTooltip(source) {
  if (!source) return;
  entries.delete(source);
  renderTooltip();
}
