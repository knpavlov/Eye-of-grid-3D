// Утилиты для логического сброса карт из руки (без UI)

function ensureZone(player, key) {
  if (!player) return null;
  if (!Array.isArray(player[key])) {
    player[key] = [];
  }
  return player[key];
}

/**
 * Удаляет карту из руки игрока и возвращает её шаблон.
 * @param {object} player - объект игрока.
 * @param {number} handIdx - индекс карты.
 * @returns {object|null} - удалённая карта либо null.
 */
export function removeHandCard(player, handIdx) {
  if (!player || typeof handIdx !== 'number') return null;
  const hand = Array.isArray(player.hand) ? player.hand : null;
  if (!hand || handIdx < 0 || handIdx >= hand.length) return null;
  const [card] = hand.splice(handIdx, 1);
  return card || null;
}

/**
 * Сбрасывает карту из руки в выбранную зону (по умолчанию в кладбище).
 * @param {object} player - объект игрока.
 * @param {number} handIdx - индекс карты в руке.
 * @param {object} [opts] - дополнительные параметры.
 * @param {string} [opts.zone='graveyard'] - целевая зона.
 * @returns {object|null} - сброшенная карта.
 */
export function discardCardFromHand(player, handIdx, { zone = 'graveyard' } = {}) {
  const card = removeHandCard(player, handIdx);
  if (!card) return null;
  const targetZone = typeof zone === 'string' ? zone : 'graveyard';
  const pile = ensureZone(player, targetZone);
  if (pile) {
    pile.push(card);
  }
  return card;
}

/**
 * Сбрасывает случайную карту из руки игрока.
 * @param {object} player - объект игрока.
 * @param {function} [rng=Math.random] - генератор случайных чисел.
 * @returns {{ card: object|null, index: number }}
 */
export function discardRandomHandCard(player, rng = Math.random) {
  const hand = Array.isArray(player?.hand) ? player.hand : [];
  if (!hand.length) {
    return { card: null, index: -1 };
  }
  const roll = Math.max(0, Math.min(hand.length - 1, Math.floor((rng?.() ?? Math.random()) * hand.length)));
  const card = discardCardFromHand(player, roll);
  return { card, index: roll };
}

const api = { removeHandCard, discardCardFromHand, discardRandomHandCard };
export default api;
