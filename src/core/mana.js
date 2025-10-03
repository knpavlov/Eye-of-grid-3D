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

// Принудительное ограничение маны всех игроков (например, при получении состояния с сервера)
export function clampAllPlayersMana(state) {
  if (!state || !Array.isArray(state.players)) {
    return state;
  }
  state.players.forEach((player) => {
    if (!player) return;
    const capped = capMana(player.mana);
    if (player.mana !== capped) {
      player.mana = capped;
    }
    if (typeof player._beforeMana === 'number') {
      player._beforeMana = capMana(player._beforeMana);
    }
  });
  return state;
}

export default { grantManaToAllPlayers, clampAllPlayersMana };
