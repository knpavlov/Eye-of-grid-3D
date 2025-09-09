// UI для Summoning Lock
// Константа с SVG замка для вставки как фон
const LOCK_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3QgeD0iOCIgeT0iMTQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNCIgZmlsbD0iI2YxZjVmOSIvPjxwYXRoIGQ9Ik0xMiAxNFYxMGE0IDQgMCAwIDEgOCAwdjQiIHN0cm9rZT0iI2YxZjVmOSIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PHJlY3QgeD0iMTQiIHk9IjIwIiB3aWR0aD0iNCIgaGVpZ2h0PSI1IiBmaWxsPSIjMGYxNzJhIi8+PC9zdmc+';

let _container = null;
let _left = null;
let _right = null;
let _unlocking = false;

function ensureElements() {
  if (typeof document === 'undefined') return;
  if (_container) return;
  _container = document.getElementById('summon-lock');
  if (!_container) return;
  // компактный блок 32x32
  const size = 32;
  _container.style.position = 'relative';
  _container.style.width = size + 'px';
  _container.style.height = size + 'px';
  _container.style.lineHeight = '0';
  _container.style.userSelect = 'none';
  _container.style.pointerEvents = 'none';
  _container.innerHTML = '';
  _left = document.createElement('div');
  _right = document.createElement('div');
  for (const el of [_left, _right]) {
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.width = size / 2 + 'px';
    el.style.height = size + 'px';
    el.style.backgroundImage = `url(${LOCK_URL})`;
    el.style.backgroundSize = size + 'px ' + size + 'px';
    el.style.overflow = 'hidden';
  }
  _left.style.left = '0';
  _left.style.backgroundPosition = '0 0';
  _right.style.left = size / 2 + 'px';
  _right.style.backgroundPosition = '-' + size / 2 + 'px 0';
  _container.appendChild(_left);
  _container.appendChild(_right);
}

export function init() {
  ensureElements();
}

export function prepareUnlock() {
  _unlocking = true;
  ensureElements();
}

export function render(unlocked) {
  ensureElements();
  if (!_container) return;
  if (unlocked && !_unlocking) {
    _container.style.display = 'none';
  } else {
    _container.style.display = 'block';
  }
}

export async function playUnlockAnimation() {
  ensureElements();
  if (!_container || !_left || !_right) return;
  _unlocking = true;
  const rect = _container.getBoundingClientRect();
  // Вспышка в области замка (~1/3 экрана)
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  const flashSize = Math.min(window.innerWidth, window.innerHeight) / 3;
  flash.style.width = flashSize + 'px';
  flash.style.height = flashSize + 'px';
  flash.style.left = rect.left + rect.width / 2 - flashSize / 2 + 'px';
  flash.style.top = rect.top + rect.height / 2 - flashSize / 2 + 'px';
  flash.style.background = 'white';
  flash.style.opacity = '0';
  flash.style.borderRadius = '50%';
  flash.style.pointerEvents = 'none';
  document.body.appendChild(flash);
  // Эффект разреза
  const slash = document.createElement('div');
  slash.style.position = 'fixed';
  slash.style.width = '4px';
  slash.style.height = rect.height * 2 + 'px';
  slash.style.left = rect.left + rect.width / 2 + 'px';
  slash.style.top = rect.top + rect.height / 2 + 'px';
  slash.style.background = 'white';
  slash.style.transformOrigin = 'center';
  slash.style.transform = 'translate(-50%, -50%) rotate(45deg)';
  slash.style.opacity = '0';
  slash.style.pointerEvents = 'none';
  document.body.appendChild(slash);
  const tl = gsap.timeline({ onComplete: () => { flash.remove(); slash.remove(); } });
  tl.to(flash, { opacity: 1, duration: 0.25 })
    .to(flash, { opacity: 0, duration: 0.25 })
    .to(slash, { opacity: 1, duration: 0.25 }, 0)
    .to(slash, { opacity: 0, duration: 0.25 }, 0.25);
  // Раскалывание замка
  tl.to(_left, { rotation: -20, x: -20, y: -10, duration: 0.1 }, 0.5);
  tl.to(_right, { rotation: 20, x: 20, y: 10, duration: 0.1 }, 0.5);
  // Задержка в раскрытом состоянии
  tl.to({}, { duration: 0.7 });
  // Исчезновение
  tl.to(_container, { opacity: 0, duration: 0.3 });
  await tl.play();
  _container.style.display = 'none';
  _container.style.opacity = '1';
  _left.style.transform = _right.style.transform = '';
  _unlocking = false;
}

// Автоинициализация при загрузке
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.summonLock = { init, render, prepareUnlock, playUnlockAnimation }; } } catch {}
