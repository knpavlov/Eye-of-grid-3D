import { sleep } from './banner.js';

function setSplashActive(v) {
  try {
    window.splashActive = !!v;
    if (typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI();
  } catch {}
}

export async function showBattleSplash() {
  setSplashActive(true);
  const bb = (typeof document !== 'undefined') ? document.getElementById('battle-banner') : null;
  if (!bb) { setSplashActive(false); return; }
  bb.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'ts-wrap';
  const bg = document.createElement('div'); bg.className = 'ts-bg'; wrap.appendChild(bg);
  const ringOuter = document.createElement('div'); ringOuter.className = 'ts-ring thin'; wrap.appendChild(ringOuter);
  const ringInner = document.createElement('div'); ringInner.className = 'ts-ring'; wrap.appendChild(ringInner);
  const streaks = document.createElement('div'); streaks.className = 'ts-streaks'; wrap.appendChild(streaks);
  const txt = document.createElement('div'); txt.className = 'ts-title ts-title-solid text-5xl md:text-8xl'; txt.textContent = 'BATTLE'; wrap.appendChild(txt);
  const scan = document.createElement('div'); scan.className = 'ts-scan'; wrap.appendChild(scan);
  bb.appendChild(wrap);
  bb.style.display = 'flex'; bb.classList.remove('hidden'); bb.classList.add('flex');
  const tl = window.gsap?.timeline?.();
  try {
    if (tl) {
      tl.set(txt, { scale: 0.65, opacity: 0 })
        .set(ringOuter, { scale: 0.8, opacity: 0 })
        .set(ringInner, { scale: 0.5, opacity: 0 })
        .fromTo(bg, { opacity: 0 }, { opacity: 0.6, duration: 0.126, ease: 'power2.out' }, 0)
        .to(ringOuter, { opacity: 1, scale: 1.0, duration: 0.196, ease: 'back.out(2.2)' }, 0.014)
        .to(ringInner, { opacity: 1, scale: 1.0, duration: 0.224, ease: 'back.out(2.2)' }, 0.042)
        .to(txt, { opacity: 1, scale: 1.08, duration: 0.252, ease: 'back.out(1.9)' }, 0.056)
        .to(txt, { scale: 1.0, duration: 0.154, ease: 'power2.out' })
        .to(scan, { yPercent: 200, duration: 0.49, ease: 'power1.inOut' }, 0.084)
        .to(streaks, { opacity: 0.25, duration: 0.35 }, 0.14)
        .to([ringOuter, ringInner], { opacity: 0.9, duration: 0.14 }, 0.315)
        .to([bg, streaks], { opacity: 0.12, duration: 0.266 }, 0.406)
        .to([txt, ringOuter, ringInner], { opacity: 0, duration: 0.196, ease: 'power2.in' }, 1.134)
        .to(bb, { opacity: 0, duration: 0.14, ease: 'power2.in' }, 1.19);
      await sleep(1330);
    } else {
      await sleep(1000);
    }
  } catch {}
  bb.classList.add('hidden'); bb.classList.remove('flex'); bb.style.display = 'none'; bb.style.opacity = '';
  bb.innerHTML = '';
  setSplashActive(false);
}

export default { showBattleSplash };
