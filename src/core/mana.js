// Утилиты для массового изменения маны игроков (без визуализации)
import { capMana } from './constants.js';

export function grantManaToAllPlayers(state, amount = 0) {
  const result = { total: 0, entries: [] };
  if (!state || !Array.isArray(state.players)) {
    return result;
  }
  const delta = Number.isFinite(amount) ? Math.floor(amount) : 0;
  if (delta <= 0) {
    return result;
  }
  state.players.forEach((player, index) => {
    if (!player) return;
    const before = typeof player.mana === 'number' ? player.mana : 0;
    const after = capMana(before + delta);
    player.mana = after;
    const gained = after - before;
    if (gained > 0) {
      result.total += gained;
      result.entries.push({ playerIndex: index, before, after, gained });
    }
  });
  return result;
}

export default { grantManaToAllPlayers };
