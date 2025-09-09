// UI для Summoning Lock
let _container = null;
let _left = null;
let _right = null;
let _unlocking = false;
const LOCK_SRC = 'textures/lock.svg';

function ensureElements() {
  if (typeof document === 'undefined') return;
  if (_container) return;
  _container = document.getElementById('summon-lock');
  if (!_container) return;
  _container.style.position = 'relative';
  _container.style.width = '24px';
  _container.style.height = '24px';
  _container.style.lineHeight = '24px';
  _container.style.textAlign = 'center';
  _container.style.fontSize = '24px';
  _container.style.userSelect = 'none';
  _container.style.pointerEvents = 'none';
  const base = 'absolute top-0 left-0';
  _container.innerHTML = '';
  _left = document.createElement('img');
  _right = document.createElement('img');
  _left.src = _right.src = LOCK_SRC;
  _left.className = base;
  _right.className = base;
  _left.style.width = '100%';
  _left.style.height = '100%';
  _right.style.width = '100%';
  _right.style.height = '100%';
  _left.style.clipPath = 'inset(0 50% 0 0)';
  _right.style.clipPath = 'inset(0 0 0 50%)';
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
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // Вспышка (круг с прозрачным градиентом)
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  // Размер вспышки на 50% меньше предыдущего
  const fSize = Math.max(window.innerWidth, window.innerHeight) / 6;
  flash.style.left = `${cx}px`;
  flash.style.top = `${cy}px`;
  flash.style.width = `${fSize}px`;
  flash.style.height = `${fSize}px`;
  flash.style.borderRadius = '50%';
  flash.style.background = 'radial-gradient(circle, rgba(255,255,200,0.9) 0%, rgba(255,255,0,0) 70%)';
  flash.style.opacity = '1';
  flash.style.transform = 'translate(-50%, -50%) scale(0.2)';
  flash.style.transformOrigin = 'center';
  flash.style.pointerEvents = 'none';
  flash.style.zIndex = '1000';
  document.body.appendChild(flash);
  // Эффект удара мечом
  const slash = document.createElement('div');
  slash.style.position = 'fixed';
  slash.style.left = `${cx}px`;
  slash.style.top = `${cy}px`;
  slash.style.width = '3px';
  slash.style.height = `${rect.height * 2}px`;
  // Яркая полоса разреза
  slash.style.background = 'linear-gradient(to bottom, #ffff00, #ff0000)';
  slash.style.boxShadow = '0 0 10px rgba(255,255,0,0.8)';
  slash.style.transformOrigin = 'center center';
  slash.style.transform = 'translate(-50%, -50%) rotate(45deg)';
  slash.style.opacity = '0';
  slash.style.pointerEvents = 'none';
  slash.style.zIndex = '1001';
  document.body.appendChild(slash);
  const tl = gsap.timeline({ onComplete: () => { flash.remove(); slash.remove(); } });
  // Вспышка резко расширяется и гаснет
  tl.to(flash, { scale: 1.5, opacity: 0, duration: 0.2, ease: 'power2.out' })
    // Полоса разреза появляется и быстро исчезает
    .to(slash, { opacity: 1, duration: 0.1 }, 0)
    .to(slash, { opacity: 0, duration: 0.2 }, 0.1);
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
