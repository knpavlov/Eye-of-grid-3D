// Кнопка отмены режима постановки карты

function show(){
  const btn = document.getElementById('cancel-placement-btn');
  if (btn) btn.classList.remove('hidden');
}

function hide(){
  const btn = document.getElementById('cancel-placement-btn');
  if (btn) btn.classList.add('hidden');
}

const api = { show, hide };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.cancelPlacement = api; } } catch {}
export default api;
