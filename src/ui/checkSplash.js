// Яркая заставка "CHECK" для мгновенного оповещения
import { refreshInputLockUI } from './inputLock.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function showCheckSplash({ playerName = null } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const banner = doc.getElementById('check-banner');
  if (!banner) return;

  try {
    if (typeof window !== 'undefined') {
      window.splashActive = true;
    }
    refreshInputLockUI();
  } catch {}

  banner.innerHTML = '';

  const wrap = doc.createElement('div');
  wrap.className = 'check-wrap';

  const glow = doc.createElement('div');
  glow.className = 'check-glow';
  wrap.appendChild(glow);

  const frame = doc.createElement('div');
  frame.className = 'check-frame';
  wrap.appendChild(frame);

  const title = doc.createElement('div');
  title.className = 'check-title';
  title.textContent = 'CHECK';
  wrap.appendChild(title);

  if (playerName) {
    const subtitle = doc.createElement('div');
    subtitle.className = 'check-subtitle';
    subtitle.textContent = playerName;
    wrap.appendChild(subtitle);
  }

  banner.appendChild(wrap);
  banner.style.display = 'flex';
  banner.classList.remove('hidden');
  banner.classList.add('flex');

  const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.() : null;
  try {
    if (tl) {
      tl.set(wrap, { scale: 0.6, opacity: 0 })
        .set(frame, { scale: 0.8, opacity: 0 })
        .set(title, { opacity: 0, letterSpacing: '0.9em' })
        .fromTo(glow, { opacity: 0 }, { opacity: 0.75, duration: 0.12, ease: 'power2.out' }, 0)
        .to(frame, { opacity: 0.9, scale: 1, duration: 0.2, ease: 'back.out(2.1)' }, 0.02)
        .to(wrap, { opacity: 1, scale: 1, duration: 0.22, ease: 'back.out(1.8)' }, 0.04)
        .to(title, { opacity: 1, letterSpacing: '0.4em', duration: 0.22, ease: 'power2.out' }, 0.06)
        .to(glow, { opacity: 0.35, duration: 0.32, ease: 'power1.out' }, 0.2)
        .to(wrap, { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0.92);

      const total = typeof tl.totalDuration === 'function' ? tl.totalDuration() : 0;
      if (total > 0 && typeof tl.timeScale === 'function') {
        const desired = 1.0;
        tl.timeScale(total / desired);
      }

      await new Promise(resolve => {
        try {
          tl.eventCallback('onComplete', () => resolve());
        } catch {
          resolve();
        }
      });
    } else {
      await sleep(1000);
    }
  } catch {
    await sleep(1000);
  } finally {
    banner.classList.add('hidden');
    banner.classList.remove('flex');
    banner.style.display = 'none';
    banner.style.opacity = '';
    banner.innerHTML = '';
    try {
      if (typeof window !== 'undefined') {
        window.splashActive = false;
      }
      refreshInputLockUI();
    } catch {}
  }
}

const api = { showCheckSplash };

try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.checkSplash = api;
  }
} catch {}

export default api;
