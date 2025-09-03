// Mana bar rendering and animations
import { worldToScreen } from '../scene/index.js';

// Keep compatibility with legacy globals
function getBlocks(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_BLOCK) || [0,0]; } catch { return [0,0]; } }
function setBlocks(v){ try { window.PENDING_MANA_BLOCK = v; } catch {} }
function getAnim(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_ANIM) || null; } catch { return null; } }
function setAnim(v){ try { window.PENDING_MANA_ANIM = v; } catch {} }

export function renderBars(gameState) {
  if (!gameState) return;
  const total = 10;
  for (let p = 0; p < 2; p++) {
    const manaDisplay = document.getElementById(`mana-display-${p}`);
    if (!manaDisplay) continue;
    const prev = manaDisplay.querySelectorAll('.mana-orb').length;
    const currentMana = gameState.players?.[p]?.mana ?? 0;
    const pending = (getAnim() && getAnim().ownerIndex === p) ? getAnim() : null;
    const block = Math.max(0, Number(getBlocks()?.[p]) || 0);
    const blockAdjusted = Math.max(0, currentMana - block);
    const renderManaBase = pending ? Math.min(blockAdjusted, Math.max(0, pending.startIdx)) : blockAdjusted;
    const renderMana = Math.max(0, Math.min(total, renderManaBase));
    manaDisplay.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const orb = document.createElement('div');
      const filled = i < renderMana;
      const isBlockedForAnim = !!(pending && i >= pending.startIdx && i <= pending.endIdx);
      orb.className = filled ? 'mana-orb' : 'mana-slot';
      orb.style.opacity = filled ? '0' : '1';
      manaDisplay.appendChild(orb);
      if (filled && !isBlockedForAnim) {
        const delay = 0.06 * Math.max(0, i - prev);
        setTimeout(()=>{
          try {
            orb.style.transform = 'translateX(16px) scale(0.6)';
            orb.style.transition = 'transform 220ms ease, opacity 220ms ease';
            requestAnimationFrame(()=>{
              orb.style.opacity = '1';
              orb.style.transform = 'translateX(0) scale(1)';
            });
          } catch {}
        }, delay*1000);
      }
    }
  }
}

export function animateManaGainFromWorld(pos, ownerIndex, visualOnly = true) {
  try {
    const start = worldToScreen(pos);
    const barEl = document.getElementById(`mana-display-${ownerIndex}`);
    if (!barEl) return;
    const gameState = (typeof window !== 'undefined') ? window.gameState : null;
    const currentMana = (gameState?.players?.[ownerIndex]?.mana) || 0;
    let targetIdx = Math.min(9, currentMana);
    try { if (visualOnly) targetIdx = Math.max(0, Math.min(9, currentMana - 1)); } catch {}
    if (visualOnly && typeof ownerIndex === 'number') {
      const b = getBlocks(); b[ownerIndex] = Math.max(0, (b[ownerIndex] || 0) + 1); setBlocks(b);
      try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
    }
    const child = barEl.children && barEl.children[targetIdx];
    let tx, ty;
    if (child) {
      const srect = child.getBoundingClientRect();
      tx = srect.left + srect.width / 2; ty = srect.top + srect.height / 2;
    } else {
      const rect = barEl.getBoundingClientRect();
      tx = rect.left + rect.width / 2; ty = rect.top + rect.height / 2;
    }
    const orb = document.createElement('div');
    orb.className = 'mana-orb'; orb.style.position = 'fixed';
    orb.style.left = start.x + 'px'; orb.style.top = start.y + 'px';
    orb.style.transform = 'translate(-50%, -50%) scale(0.3)';
    orb.style.opacity = '0'; orb.style.zIndex = '60';
    document.body.appendChild(orb);
    const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: ()=>{
      try { if (orb && orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
      if (visualOnly && typeof ownerIndex === 'number') {
        const b2 = getBlocks(); b2[ownerIndex] = Math.max(0, (b2[ownerIndex] || 0) - 1); setBlocks(b2);
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      }
    }}) : null;
    if (tl) {
      tl.to(orb, { duration: 0.5, ease: 'back.out(1.4)', opacity: 1, transform: 'translate(-50%, -50%) scale(1)' })
        .to(orb, { duration: 2.0, ease: 'power2.inOut', left: tx, top: ty }, '>-0.1');
    }
  } catch {}
}

export function animateTurnManaGain(ownerIndex, beforeMana, afterMana, durationMs = 1500) {
  return new Promise(resolve => {
    try {
      let manaGainActive = true;
      try { if (typeof window !== 'undefined') window.manaGainActive = true; } catch {}
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
      const startIdx = Math.max(0, Math.min(9, beforeMana));
      const endIdx = Math.max(-1, Math.min(9, afterMana - 1));
      setAnim({ ownerIndex, startIdx, endIdx });
      try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      const bar = document.getElementById(`mana-display-${ownerIndex}`);
      if (!bar) { setAnim(null); resolve(); return; }
      const indices = []; for (let i = startIdx; i <= endIdx; i++) indices.push(i);
      const sparks = [];
      const cleanup = () => {
        for (const s of sparks) { try { if (s.parentNode) s.parentNode.removeChild(s); } catch {} }
        setAnim(null); manaGainActive = false;
        try { if (typeof window !== 'undefined') window.manaGainActive = false; } catch {}
        try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
        // Ensure final mana state is rendered after animation completes
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      };
      const rect = bar.getBoundingClientRect();
      const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
      const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: ()=>{ cleanup(); resolve(); }}) : null;
      if (tl) {
        const startIdx2 = startIdx, endIdx2 = endIdx;
        for (let i = 0; i < indices.length; i++) {
          const idx = indices[i];
          const el = bar.children[idx] || bar;
          const r = el.getBoundingClientRect(); const tx = r.left + r.width/2; const ty = r.top + r.height/2;
          const sp = document.createElement('div'); sp.className = 'mana-orb';
          sp.style.position = 'fixed'; sp.style.left = cx+'px'; sp.style.top = cy+'px'; sp.style.opacity = '0'; sp.style.transform = 'translate(-50%, -50%) scale(0.6)'; sp.style.zIndex = '60';
          document.body.appendChild(sp); sparks.push(sp);
          const dist = Math.max(12, Math.hypot(tx - cx, ty - cy));
          const angle = Math.atan2(ty - cy, tx - cx);
          const dx = Math.cos(angle) * dist; const dy = Math.sin(angle) * dist;
          const t0 = (idx - startIdx2) * 0.056;
          tl.fromTo(sp, { x: 0, y: 0, opacity: 0, scale: 0.6 }, { x: dx, y: dy, opacity: 1, scale: 1.2, duration: 0.154, ease: 'power2.out' }, t0)
            .to(sp, { opacity: 0, scale: 0.3, duration: 0.35, ease: 'power1.in', delay: 0.105 }, `>-0.1`);
        }
        tl.to({}, { duration: Math.max(0, (durationMs/1000) - tl.duration()) });
      } else { cleanup(); resolve(); }
    } catch { resolve(); }
  });
}

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;

