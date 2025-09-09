// UI для Summoning Lock
let _container = null;
let _left = null;
let _right = null;
let _unlocking = false;

function ensureElements() {
  if (typeof document === 'undefined') return;
  if (_container) return;
  _container = document.getElementById('summon-lock');
  if (!_container) return;
  _container.style.position = 'relative';
  _container.style.width = '32px';
  _container.style.height = '32px';
  _container.style.lineHeight = '32px';
  _container.style.textAlign = 'center';
  _container.style.fontSize = '32px';
  _container.style.userSelect = 'none';
  _container.style.pointerEvents = 'none';
  const base = 'absolute top-0 left-0 text-3xl';
  _container.innerHTML = '';
  _left = document.createElement('div');
  _right = document.createElement('div');
  _left.className = base;
  _right.className = base;
  _left.style.width = _right.style.width = '100%';
  _left.style.clipPath = 'inset(0 50% 0 0)';
  _right.style.clipPath = 'inset(0 0 0 50%)';
  _left.textContent = '🔒';
  _right.textContent = '🔒';
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
  // Вспышка возле замка
  const rect = _container.getBoundingClientRect();
  const size = Math.min(window.innerWidth, window.innerHeight) * 0.33;
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.width = flash.style.height = `${size}px`;
  flash.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
  flash.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
  flash.style.background = 'white';
  flash.style.borderRadius = '50%';
  flash.style.opacity = '0';
  flash.style.pointerEvents = 'none';
  document.body.appendChild(flash);
  // Эффект разреза
  const slash = document.createElement('div');
  slash.style.position = 'fixed';
  slash.style.left = `${rect.left + rect.width / 2}px`;
  slash.style.top = `${rect.top + rect.height / 2}px`;
  slash.style.width = '4px';
  slash.style.height = '80px';
  slash.style.background = 'white';
  slash.style.transformOrigin = 'center center';
  slash.style.transform = 'translate(-50%, -50%) rotate(45deg)';
  slash.style.opacity = '0';
  slash.style.pointerEvents = 'none';
  document.body.appendChild(slash);
  const tl = gsap.timeline({ onComplete: () => { flash.remove(); slash.remove(); } });
  tl.to(flash, { opacity: 1, duration: 0.25 })
    .to(flash, { opacity: 0, duration: 0.25 })
    .to(slash, { opacity: 1, duration: 0.1 }, 0.25)
    .to(slash, { opacity: 0, duration: 0.15 }, 0.35);
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
