// Управление общей кнопкой отмены действий
export function showCancelButton() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('cancel-target-btn');
  if (btn) btn.classList.remove('hidden');
}

export function hideCancelButton() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('cancel-target-btn');
  if (btn) btn.classList.add('hidden');
}

const api = { showCancelButton, hideCancelButton };
try {
  if (typeof window !== 'undefined') {
    window.__ui = window.__ui || {};
    window.__ui.cancel = api;
  }
} catch {}

export default api;
