// Модуль отображения и анимации замка Summoning Lock
let _removed = false;

export function render(state){
  const el = document.getElementById('summoning-lock');
  if (!el) return;
  if (_removed) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
}

// Анимация раскалывания замка
export function playUnlockAnimation(){
  const el = document.getElementById('summoning-lock');
  if (!el || _removed) return;
  const gs = (typeof window !== 'undefined') ? window.gsap : null;
  if (!gs) { el.classList.add('hidden'); _removed = true; return; }
  el.style.position = 'relative';
  el.innerHTML = '';
  const full = document.createElement('div');
  full.textContent = '🔒';
  full.style.position = 'absolute';
  full.style.top = '0';
  full.style.left = '0';
  const left = document.createElement('div');
  left.textContent = '🔒';
  left.style.position = 'absolute';
  left.style.top = '0';
  left.style.left = '0';
  left.style.clipPath = 'polygon(0 0,50% 0,50% 100%,0 100%)';
  left.style.opacity = '0';
  const right = document.createElement('div');
  right.textContent = '🔒';
  right.style.position = 'absolute';
  right.style.top = '0';
  right.style.left = '0';
  right.style.clipPath = 'polygon(50% 0,100% 0,100% 100%,50% 100%)';
  right.style.opacity = '0';
  const slash = document.createElement('div');
  slash.style.position = 'absolute';
  slash.style.top = '0';
  slash.style.left = '0';
  slash.style.width = '100%';
  slash.style.height = '100%';
  slash.style.background = 'rgba(255,255,255,0.9)';
  slash.style.transform = 'rotate(-45deg) scaleY(0.1)';
  slash.style.opacity = '0';
  const flash = document.createElement('div');
  flash.style.position = 'absolute';
  flash.style.inset = '0';
  flash.style.borderRadius = '50%';
  flash.style.background = 'rgba(255,255,255,0.8)';
  flash.style.opacity = '0';
  el.appendChild(full);
  el.appendChild(left);
  el.appendChild(right);
  el.appendChild(slash);
  el.appendChild(flash);
  const tl = gs.timeline({ onComplete: () => { _removed = true; el.classList.add('hidden'); el.innerHTML=''; } });
  tl.to(flash, { opacity:1, duration:0.25 })
    .to(flash, { opacity:0, duration:0.25 })
    .to(slash, { opacity:1, duration:0.5 }, '<')
    .set(full, { opacity:0 })
    .set([left,right], { opacity:1 })
    .to(left, { x:-20, rotate:-20, duration:0.1 })
    .to(right, { x:20, rotate:20, duration:0.1 }, '<')
    .to({}, { duration:0.7 })
    .to([left,right,slash], { opacity:0, duration:0.3 });
}

export default { render, playUnlockAnimation };

try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.summoningLock = { render, playUnlockAnimation }; } } catch {}
