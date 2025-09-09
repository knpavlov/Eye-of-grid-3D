// Управление отображением и анимацией замка призыва
export function render(state) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('summoning-lock');
  if (!el) return;
  const unlocked = !!state?.summoningUnlocked;
  // Пока замок не разблокирован, иконка отображается
  if (!unlocked) {
    el.classList.remove('hidden');
    el.style.opacity = '';
    return;
  }
  // После разблокировки и завершения анимации иконка скрывается
  if (!el.classList.contains('animating')) {
    el.classList.add('hidden');
  }
}

// Специальная анимация разрушения замка
export function playUnlockAnimation() {
  if (typeof document === 'undefined' || typeof gsap === 'undefined') return Promise.resolve();
  const el = document.getElementById('summoning-lock');
  if (!el) return Promise.resolve();
  const left = el.querySelector('.lock-half.left');
  const right = el.querySelector('.lock-half.right');
  el.classList.add('animating');
  el.classList.remove('hidden');

  const flash = document.createElement('div');
  flash.className = 'lock-flash';
  el.appendChild(flash);
  const slash = document.createElement('div');
  slash.className = 'lock-slash';
  el.appendChild(slash);

  return new Promise(resolve => {
    const tl = gsap.timeline({
      onComplete: () => {
        flash.remove();
        slash.remove();
        el.classList.remove('animating');
        el.classList.add('hidden');
        el.style.opacity = '';
        resolve();
      }
    });

    tl.to(flash, { opacity: 1, duration: 0.25 })
      .to(flash, { opacity: 0, duration: 0.25 })
      .to(slash, { opacity: 1, duration: 0.5 }, 0)
      .to(slash, { opacity: 0, duration: 0.5 }, 0.5)
      .to(left, { rotation: -45, x: -20, duration: 0.1 }, 0.5)
      .to(right, { rotation: 45, x: 20, duration: 0.1 }, 0.5)
      .to({}, { duration: 0.7 })
      .to(el, { opacity: 0, duration: 0.3 });
  });
}

const api = { render, playUnlockAnimation };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.summoningLock = api; } } catch {}

export default api;
