// Обработка начисления маны за смерти существ (без визуальной логики)
import { capMana } from '../constants.js';

function sanitizeGain(rawValue, fallback = 1) {
  if (!Number.isFinite(rawValue)) return fallback;
  const rounded = Math.floor(rawValue);
  return rounded > 0 ? rounded : 0;
}

function clampMana(value) {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}

export function applyManaGainOnDeaths(state, deaths, context = {}) {
  const result = { events: [], logs: [] };
  if (!state || !Array.isArray(state.players) || !Array.isArray(deaths) || !deaths.length) {
    return result;
  }

  const players = state.players;
  const cause = context.cause || null;
  const beforePlayers = Array.isArray(context.beforePlayers) ? context.beforePlayers : null;
  const baseGain = sanitizeGain(context.gainPerDeath, 1);

  for (const death of deaths) {
    if (!death || typeof death.owner !== 'number') continue;
    const player = players[death.owner];
    if (!player) continue;

    const rewardRaw = sanitizeGain(death?.manaReward, baseGain);
    if (rewardRaw <= 0) continue;

    const before = clampMana(player.mana);
    const after = capMana(before + rewardRaw);
    player.mana = after;

    const gained = after - before;
    const event = {
      owner: death.owner,
      amount: gained,
      beforeMana: before,
      afterMana: after,
      death,
      cause,
    };
    if (beforePlayers) {
      event.playersBefore = beforePlayers;
    }
    if (death?.element) {
      event.element = death.element;
    }
    result.events.push(event);
  }

  result.total = result.events.reduce((sum, ev) => sum + (ev.amount || 0), 0);
  return result;
}

export function snapshotPlayersMana(players) {
  if (!Array.isArray(players)) return [];
  return players.map(pl => ({ mana: clampMana(pl?.mana) }));
}

export default { applyManaGainOnDeaths, snapshotPlayersMana };
