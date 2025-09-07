// Minimal always-on status chip, extracted from index.html

export function mount() {
  if (document.getElementById('mod-status')) return;
  const el = document.createElement('div');
  el.id = 'mod-status';
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#cbd5e1;background:rgba(15,23,42,.85);border:1px solid #334155;border-radius:8px;padding:6px 8px;pointer-events:none;';
  el.textContent = 'status…';
  document.body.appendChild(el);
  function ok(b){ return '<span style="color:' + (b ? '#22c55e' : '#ef4444') + '">●</span>'; }
  function upd(){
    const cardsOk = !!(window.CARDS && Object.keys(window.CARDS||{}).length);
    const starterLen = (window.STARTER_FIRESET && window.STARTER_FIRESET.length) || 0;
    const rulesOk = ['computeCellBuff','effectiveStats','computeHits','stagedAttack','magicAttack'].every(k=>typeof window[k]==='function');
    const stateOk = ['startGame','drawOne','drawOneNoAdd','shuffle','countControlled'].every(k=>typeof window[k]==='function');
    const threeOk = !!(window.renderer && window.scene && window.camera);
    const boardOk = !!(window.tileMeshes && window.tileMeshes.length && window.tileMeshes[0] && window.tileMeshes[0].length);
    const gsOk = !!(window.gameState && Array.isArray(window.gameState.board));
    const net = (typeof window.NET_ACTIVE!=='undefined' && window.NET_ACTIVE) ? 'online' : 'offline';
    el.innerHTML = ok(cardsOk)+' cards ('+starterLen+') · '+ok(rulesOk)+' rules · '+ok(stateOk)+' state · '+ok(threeOk)+' three · '+ok(boardOk)+' board · '+ok(gsOk)+' gState · '+ok(net==='online')+' net:'+net;
  }
  upd();
  setInterval(upd, 1000);
  function kick(){
    try {
      if (!(window.renderer && window.scene && window.camera)) {
        if (typeof window.init === 'function') { window.init(); return; }
        if (typeof window.initThreeJS === 'function') {
          try { window.initThreeJS(); } catch(e){}
          if (typeof window.animate === 'function') try { window.requestAnimationFrame(window.animate); } catch(e){}
        }
        if (typeof window.initGame === 'function') { try { window.initGame(); } catch(e){} }
      }
    } catch(e){}
  }
  setTimeout(kick, 200);
  setTimeout(kick, 1200);
  setTimeout(kick, 3000);
}

const api = { mount };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.statusChip = api; } } catch {}
export default api;
