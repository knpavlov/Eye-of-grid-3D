// Вспомогательные функции для воспроизведения визуальных эффектов кражи маны
import { consumeManaStealEvents } from '../core/abilityHandlers/manaSteal.js';

export function flushManaStealFx(state, opts = {}) {
  try {
    if (!state) return [];
    const events = consumeManaStealEvents(state);
    if (!Array.isArray(events) || !events.length) return [];
    const addLog = typeof opts.addLog === 'function' ? opts.addLog : null;
    const animator = (typeof window !== 'undefined')
      ? (window.animateManaSteal || window.__ui?.mana?.animateManaSteal)
      : null;
    for (const ev of events) {
      if (ev?.log && addLog) {
        addLog(ev.log);
      }
    }
    if (typeof animator === 'function') {
      events.forEach((event, idx) => {
        try { animator(event, idx); } catch (err) { console.warn('[manaStealFx] анимация не выполнена', err); }
      });
    }
    return events;
  } catch (err) {
    console.warn('[manaStealFx] не удалось обработать события кражи маны', err);
    return [];
  }
}

export default { flushManaStealFx };
