// Утилиты для перерасчёта и логирования эффектов контроля (possession)
// Держим логику отдельно от визуальной части, чтобы было проще переносить
// на другие движки вроде Unity.

import { refreshContinuousPossessions } from '../core/abilities.js';

function getUnitName(state, r, c) {
  const unit = state?.board?.[r]?.[c]?.unit;
  if (!unit) return 'Существо';
  const cards = (typeof window !== 'undefined' && window.CARDS) || null;
  const tpl = cards ? cards[unit.tplId] : null;
  return tpl?.name || 'Существо';
}

export function refreshPossessionsUI(state, options = {}) {
  if (!state) {
    return { possessions: [], releases: [] };
  }
  const events = refreshContinuousPossessions(state) || { possessions: [], releases: [] };
  const addLog = options.addLog || (typeof window !== 'undefined' ? window.addLog : null);
  if (typeof addLog === 'function') {
    for (const ev of events.possessions || []) {
      const name = getUnitName(state, ev.r, ev.c);
      const ownerLabel = (ev.newOwner != null) ? ev.newOwner + 1 : '?';
      addLog(`${name}: контроль переходит к игроку ${ownerLabel}.`);
    }
    for (const rel of events.releases || []) {
      const name = getUnitName(state, rel.r, rel.c);
      const ownerLabel = (rel.owner != null) ? rel.owner + 1 : '?';
      addLog(`${name}: контроль возвращается к игроку ${ownerLabel}.`);
    }
  }
  if (typeof options.onChange === 'function' && (events.possessions?.length || events.releases?.length)) {
    try {
      options.onChange(events);
    } catch (err) {
      console.error('[refreshPossessionsUI:onChange]', err);
    }
  }
  return events;
}

export default { refreshPossessionsUI };
