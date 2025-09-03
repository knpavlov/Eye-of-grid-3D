// Simple notifications center

export function show(message, type = 'info') {
  try {
    const notification = document.createElement('div');
    notification.className = `overlay-panel p-4 mb-2 ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
    notification.textContent = String(message ?? '');
    const container = document.getElementById('notifications');
    if (!container) return;
    container.appendChild(notification);
    setTimeout(() => {
      try { if (notification.parentNode) notification.parentNode.removeChild(notification); } catch {}
    }, 3000);
  } catch {}
}

const api = { show };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.notifications = api; } } catch {}
export default api;

