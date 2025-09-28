import { describe, it, expect, beforeEach, vi } from 'vitest';

// Мокаем модуль БД и сохраняем ссылки на вызовы для проверок
const state = { responses: [] };
const queryMock = vi.fn(async (text, params) => {
  if (!state.responses.length) {
    throw new Error(`Неожиданный SQL: ${text}`);
  }
  const next = state.responses.shift();
  if (typeof next === 'function') {
    return await next(text, params);
  }
  return next;
});

vi.mock('../server/db.js', () => ({
  isDbReady: () => true,
  query: queryMock,
}));

const repositoryPromise = import('../server/repositories/decksRepository.js');

function setQueryResponses(responses) {
  state.responses = [...responses];
}

describe('upsertDeckForUser', () => {
  beforeEach(() => {
    queryMock.mockClear();
    setQueryResponses([]);
  });

  it('создаёт новую колоду с указанным идентификатором при его отсутствии в базе', async () => {
    setQueryResponses([
      { rows: [] },
      {
        rows: [
          {
            id: 'DECK_TEST',
            name: 'My deck',
            description: '',
            cards: ['FIRE_FLAME_MAGUS'],
            owner_id: 'user-1',
            version: 1,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    ]);

    const { upsertDeckForUser } = await repositoryPromise;
    const saved = await upsertDeckForUser({
      id: 'DECK_TEST',
      name: 'My deck',
      description: '',
      cards: ['FIRE_FLAME_MAGUS'],
    }, 'user-1');

    expect(saved).toMatchObject({ id: 'DECK_TEST', ownerId: 'user-1' });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/SELECT.+FROM decks/i);
    expect(queryMock.mock.calls[1][0]).toMatch(/INSERT INTO decks/i);
  });

  it('обновляет существующую колоду текущего пользователя', async () => {
    setQueryResponses([
      {
        rows: [
          {
            id: 'DECK_TEST',
            name: 'Old name',
            description: '',
            cards: ['FIRE_FLAME_MAGUS'],
            owner_id: 'user-1',
            version: 1,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        rows: [
          {
            id: 'DECK_TEST',
            name: 'Updated name',
            description: 'desc',
            cards: ['FIRE_FLAME_MAGUS'],
            owner_id: 'user-1',
            version: 2,
            updated_at: '2024-01-02T00:00:00.000Z',
          },
        ],
      },
    ]);

    const { upsertDeckForUser } = await repositoryPromise;
    const saved = await upsertDeckForUser({
      id: 'DECK_TEST',
      name: 'Updated name',
      description: 'desc',
      cards: ['FIRE_FLAME_MAGUS'],
    }, 'user-1');

    expect(saved).toMatchObject({
      id: 'DECK_TEST',
      name: 'Updated name',
      description: 'desc',
      version: 2,
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/SELECT.+FROM decks/i);
    expect(queryMock.mock.calls[1][0]).toMatch(/UPDATE decks/i);
  });
});
