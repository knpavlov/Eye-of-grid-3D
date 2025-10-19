// Заставка предупреждения "CHECK" и подсветка панелей контроля

import { refreshInputLockUI } from './inputLock.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const CONTROL_ALERT_CLASS = 'control-alert';
const _blinkTimeouts = new Map();

function flashControlPanel(playerIndex, duration = 1400) {
  if (typeof document === 'undefined') return;
  if (playerIndex !== 0 && playerIndex !== 1) return;
  const el = document.getElementById(`control-info-${playerIndex}`);
  if (!el) return;
  try { el.classList.add(CONTROL_ALERT_CLASS); } catch {}
  if (_blinkTimeouts.has(playerIndex)) {
    const prev = _blinkTimeouts.get(playerIndex);
    try { clearTimeout(prev); } catch {}
  }
  const timeoutId = setTimeout(() => {
    try { el.classList.remove(CONTROL_ALERT_CLASS); } catch {}
    _blinkTimeouts.delete(playerIndex);
  }, duration);
  _blinkTimeouts.set(playerIndex, timeoutId);
}

async function showCheckSplash() {
  if (typeof document === 'undefined') return;
  const w = typeof window !== 'undefined' ? window : null;
  try {
    if (w && w.checkSplashActive) return;
    if (w) {
      w.checkSplashActive = true;
      w.splashActive = true;
    }
    refreshInputLockUI();
    const host = document.getElementById('check-banner');
    if (!host) {
      if (w) {
        w.checkSplashActive = false;
        w.splashActive = false;
      }
      refreshInputLockUI();
      return;
    }
    host.innerHTML = '';
    host.style.opacity = '1';

    const wrap = document.createElement('div');
    wrap.className = 'check-wrap';
    const bg = document.createElement('div');
    bg.className = 'check-bg';
    wrap.appendChild(bg);
    const plate = document.createElement('div');
    plate.className = 'check-plate';
    wrap.appendChild(plate);
    const rays = document.createElement('div');
    rays.className = 'check-rays';
    wrap.appendChild(rays);
    const ring = document.createElement('div');
    ring.className = 'check-ring';
    wrap.appendChild(ring);
    const txt = document.createElement('div');
    txt.className = 'check-title text-5xl md:text-7xl';
    txt.textContent = 'CHECK';
    wrap.appendChild(txt);
    const scan = document.createElement('div');
    scan.className = 'check-scan';
    wrap.appendChild(scan);

    host.appendChild(wrap);
    host.classList.remove('hidden');
    host.classList.add('flex');
    host.style.display = 'flex';

    const tl = w?.gsap?.timeline?.();
    try {
      tl?.set([plate, ring, rays, txt], { opacity: 0 })
        ?.set(txt, { scale: 0.6 })
        ?.set(ring, { scale: 0.7 })
        ?.fromTo(bg, { opacity: 0 }, { opacity: 0.55, duration: 0.12, ease: 'power2.out' }, 0)
        ?.to(plate, { opacity: 1, scale: 1.0, duration: 0.22, ease: 'back.out(2.1)' }, 0.04)
        ?.to(ring, { opacity: 1, scale: 1.1, duration: 0.28, ease: 'back.out(1.8)' }, 0.06)
        ?.to(txt, { opacity: 1, scale: 1.12, duration: 0.24, ease: 'back.out(2.4)' }, 0.08)
        ?.to(txt, { scale: 1.0, duration: 0.16, ease: 'power2.out' }, 0.32)
        ?.to(rays, { opacity: 0.75, duration: 0.26, ease: 'power1.out' }, 0.12)
        ?.to(scan, { yPercent: 200, duration: 0.52, ease: 'power1.inOut' }, 0.1)
        ?.to([rays, ring], { opacity: 0, duration: 0.22, ease: 'power1.in' }, 0.72)
        ?.to([txt, plate], { opacity: 0, duration: 0.16, ease: 'power2.in' }, 0.78)
        ?.to(host, { opacity: 0, duration: 0.14, ease: 'power2.in' }, 0.86);
      tl?.timeScale?.(1.0);
      await sleep(1000);
    } catch {
      await sleep(1000);
    }

    host.classList.add('hidden');
    host.classList.remove('flex');
    host.style.display = 'none';
    host.style.opacity = '';
    host.innerHTML = '';
  } finally {
    const w = typeof window !== 'undefined' ? window : null;
    if (w) {
      w.checkSplashActive = false;
      w.splashActive = false;
    }
    refreshInputLockUI();
  }
}

function playCheckAlert(playerIndex) {
  try { showCheckSplash(); } catch {}
  flashControlPanel(playerIndex);
}

const api = { showCheckSplash, flashControlPanel, playCheckAlert };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.checkSplash = api;
    window.showCheckSplash = showCheckSplash;
  }
} catch {}

export { showCheckSplash, flashControlPanel, playCheckAlert };
export default api;
