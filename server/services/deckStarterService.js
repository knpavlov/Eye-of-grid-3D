// Сервис для гарантированного создания стартовых колод игрока
// Логика изолирована, чтобы при переносе на другой движок менять только слой хранения

import { listDecksForUser, upsertDeckForUser } from '../repositories/decksRepository.js';

function normalizeBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return null;
  const name = typeof blueprint.name === 'string' ? blueprint.name.trim() : '';
  const description = typeof blueprint.description === 'string' ? blueprint.description : '';
  const cards = Array.isArray(blueprint.cards)
    ? blueprint.cards.map(card => (typeof card === 'string' ? card.trim() : '')).filter(Boolean)
    : [];
  if (!name || !cards.length) return null;
  return { name, description, cards };
}

export async function ensureStarterDecksForUser(userId, blueprints = []) {
  if (!userId || !Array.isArray(blueprints) || !blueprints.length) return [];
  let existingDecks = [];
  try {
    existingDecks = await listDecksForUser(userId, { includeShared: false });
  } catch (err) {
    console.warn('[deckStarter] Не удалось загрузить список колод пользователя', userId, err);
    throw err;
  }
  const existingNames = new Set(
    existingDecks
      .map(deck => (deck?.name ? deck.name.trim().toLowerCase() : ''))
      .filter(Boolean),
  );
  const created = [];
  for (const blueprint of blueprints) {
    const normalized = normalizeBlueprint(blueprint);
    if (!normalized) continue;
    if (existingNames.has(normalized.name.toLowerCase())) continue;
    try {
      const saved = await upsertDeckForUser({
        name: normalized.name,
        description: normalized.description,
        cards: normalized.cards,
      }, userId);
      if (saved) {
        created.push(saved);
        existingNames.add(normalized.name.toLowerCase());
      }
    } catch (err) {
      console.warn('[deckStarter] Не удалось создать стартовую колоду', normalized.name, 'для', userId, err);
    }
  }
  return created;
}

export default { ensureStarterDecksForUser };
