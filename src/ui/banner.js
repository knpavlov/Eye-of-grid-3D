// Turn banner UI (GSAP-based). Provides queued and retry helpers.

let _lastTurnSplashPromise = Promise.resolve();
let _splashActive = false;
let _lastRequestedTurn = 0;
let _lastShownTurn = 0;
let _splashInProgress = false; // Гарантия от параллельных вызовов

function setSplashActive(v) {
  _splashActive = !!v;
  try {
    if (typeof window !== 'undefined') window.splashActive = _splashActive;
    if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI();
  } catch {}
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export async function showTurnSplash(title) {
  if (_splashInProgress) {
    // Если уже показываем заставку, ждем завершения
    return _lastTurnSplashPromise;
  }
  _splashInProgress = true;
  setSplashActive(true);
  const tb = (typeof document !== 'undefined') ? document.getElementById('turn-banner') : null;
  if (!tb) { setSplashActive(false); _splashInProgress = false; return; }
  tb.innerHTML = '';
  // Build DOM
  const wrap = document.createElement('div'); wrap.className = 'ts-wrap';
  const bg = document.createElement('div'); bg.className = 'ts-bg'; wrap.appendChild(bg);
  const ringOuter = document.createElement('div'); ringOuter.className = 'ts-ring thin'; wrap.appendChild(ringOuter);
  const ringInner = document.createElement('div'); ringInner.className = 'ts-ring'; wrap.appendChild(ringInner);
  const streaks = document.createElement('div'); streaks.className = 'ts-streaks'; wrap.appendChild(streaks);
  const txt = document.createElement('div'); txt.className = 'ts-title ts-title-solid text-4xl md:text-6xl'; txt.textContent = title; wrap.appendChild(txt);
  const scan = document.createElement('div'); scan.className = 'ts-scan'; wrap.appendChild(scan);
  tb.appendChild(wrap);
  tb.style.display = 'flex'; tb.classList.remove('hidden'); tb.classList.add('flex');
  // Animate (best-effort if gsap is present)
  const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.() : null;
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
        .to(tb, { opacity: 0, duration: 0.14, ease: 'power2.in' }, 1.19);
      await sleep(1330);
    } else {
      // Fallback: simple 1s show
      await sleep(1000);
    }
  } catch {}
  tb.classList.add('hidden'); tb.classList.remove('flex'); tb.style.display = 'none'; tb.style.opacity = '';
  tb.innerHTML = '';
  setSplashActive(false);
  _splashInProgress = false;
}

export function queueTurnSplash(title){
  try {
    _lastTurnSplashPromise = _lastTurnSplashPromise.then(()=> showTurnSplash(title));
  } catch {}
  return _lastTurnSplashPromise;
}

export async function requestTurnSplash(currentTurn){
  if (typeof currentTurn !== 'number') return _lastTurnSplashPromise;
  if (_lastShownTurn >= currentTurn) return _lastTurnSplashPromise;
  if (_lastRequestedTurn === currentTurn && !_splashInProgress) return _lastTurnSplashPromise;
  _lastRequestedTurn = currentTurn;
  let title = `Turn ${currentTurn}`;
  try {
    const seat = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.active === 'number')
      ? window.gameState.active : null;
    if (seat !== null) title = `Turn ${currentTurn} - Player ${seat + 1}`;
  } catch {}
  _lastTurnSplashPromise = queueTurnSplash(title).then(()=>{ _lastShownTurn = currentTurn; });
  return _lastTurnSplashPromise;
}

export async function forceTurnSplashWithRetry(maxRetries = 2, currentTurn = null) {
  // Проверяем, не показали ли мы уже этот ход
  if (typeof currentTurn === 'number' && _lastShownTurn >= currentTurn) {
    return Promise.resolve();
  }
  
  let tries = 0; let shown = false;
  while (tries <= maxRetries && !shown) {
    tries += 1;
    try { 
      await requestTurnSplash(currentTurn); 
      shown = true; // Если requestTurnSplash завершился успешно, считаем что показали
    } catch {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const tb = document.getElementById('turn-banner');
        shown = !!tb && (tb.classList.contains('flex') || tb.style.display === 'flex');
      } catch { shown = false; }
    }
  }
  // Убираем setTimeout - он может прервать следующую заставку
}

export function getState(){
  return { _splashActive, _lastRequestedTurn, _lastShownTurn };
}

const api = { showTurnSplash, queueTurnSplash, requestTurnSplash, forceTurnSplashWithRetry, getState };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.banner = api; } } catch {}
export default api;
