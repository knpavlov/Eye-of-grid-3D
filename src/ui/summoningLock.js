// Управление иконкой блокировки призыва
export function render(state) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('summoning-lock');
  if (!el) return;
  if (state.summoningUnlocked) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.opacity = '1';
    el.style.filter = '';
  }
}

// Эффект разблокировки: вспышка, диагональный разрез и исчезновение
export async function playUnlockAnimation() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('summoning-lock');
  if (!el) return;
  const left = el.querySelector('.lock-half.left');
  const right = el.querySelector('.lock-half.right');
  if (!left || !right) return;
  const slash = document.createElement('div');
  slash.className = 'lock-slash';
  el.appendChild(slash);
  return new Promise(resolve => {
    const tl = gsap.timeline({ onComplete: () => { el.classList.add('hidden'); slash.remove(); resolve(); } });
    tl.to(el, { filter: 'brightness(3)', duration: 0.5, ease: 'power2.out' })
      .to(slash, { opacity: 1, duration: 0.5 }, '<')
      .to(left, { x: -20, y: -10, rotate: -30, duration: 0.1 })
      .to(right, { x: 20, y: 10, rotate: 30, duration: 0.1 }, '<')
      .to({}, { duration: 0.7 })
      .to(el, { opacity: 0, duration: 0.3 });
  });
}

export default { render, playUnlockAnimation };
