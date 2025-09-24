// Управление всплывающей подсказкой hover-tooltip
const entries = new Map();
let activeExtraClasses = [];

function getTooltipElement() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('hover-tooltip');
}

function removeExtraClasses(el) {
  if (!el || !activeExtraClasses.length) return;
  for (const cls of activeExtraClasses) {
    el.classList.remove(cls);
  }
  activeExtraClasses = [];
}

function applyExtraClasses(el, className) {
  if (!el) return;
  removeExtraClasses(el);
  if (!className) return;
  const unique = Array.from(new Set(String(className).split(/\s+/).filter(Boolean)));
  unique.forEach(cls => el.classList.add(cls));
  activeExtraClasses = unique;
}

function renderTooltip() {
  const el = getTooltipElement();
  if (!el) return;
  if (!entries.size) {
    el.classList.add('hidden');
    removeExtraClasses(el);
    el.innerHTML = '';
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
    removeExtraClasses(el);
    el.innerHTML = '';
    return;
  }
  if (latest.html != null) {
    el.innerHTML = latest.html;
  } else {
    el.textContent = latest.text;
  }
  el.style.left = `${latest.x}px`;
  el.style.top = `${latest.y}px`;
  applyExtraClasses(el, latest.className);
  el.classList.remove('hidden');
}

export function showTooltip(source, { text, html, x, y, className }) {
  if (!source) return;
  entries.set(source, {
    text: String(text ?? ''),
    html: html != null ? String(html) : null,
    x: Math.round(x ?? 0),
    y: Math.round(y ?? 0),
    timestamp: Date.now(),
    className: className ? String(className) : '',
  });
  renderTooltip();
}

export function hideTooltip(source) {
  if (!source) return;
  entries.delete(source);
  renderTooltip();
}
