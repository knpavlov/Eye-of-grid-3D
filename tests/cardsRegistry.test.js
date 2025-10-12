import { describe, it, expect } from 'vitest';
import { CARDS, mergeExternalCardTemplates } from '../src/core/cards.js';

describe('mergeExternalCardTemplates', () => {
  it('добавляет новую карту и создаёт псевдонимы', () => {
    const tempId = 'TEST_EXTERNAL_CARD_ALPHA';
    const beforeKeys = new Set(Object.keys(CARDS));
    mergeExternalCardTemplates([{ id: tempId, name: 'Alpha', type: 'UNIT', tplId: 'test_external_card_alpha', cardId: 'AlphaCard' }]);
    expect(CARDS[tempId]).toBeTruthy();
    expect(CARDS[tempId].name).toBe('Alpha');
    expect(CARDS['test_external_card_alpha']).toBe(CARDS[tempId]);
    expect(CARDS['AlphaCard']).toBe(CARDS[tempId]);
    for (const key of Object.keys(CARDS)) {
      if (!beforeKeys.has(key) && CARDS[key]?.id === tempId) {
        delete CARDS[key];
      }
    }
  });

  it('дополняет существующие поля, не затирая заполненные значения', () => {
    const cardId = 'TEST_EXTERNAL_CARD_BETA';
    mergeExternalCardTemplates([{ id: cardId, name: 'Beta', type: 'UNIT', atk: 2, hp: 3 }]);
    expect(CARDS[cardId].atk).toBe(2);
    mergeExternalCardTemplates([{ id: cardId, atk: 4, hp: 5, desc: 'New desc' }]);
    expect(CARDS[cardId].atk).toBe(2);
    expect(CARDS[cardId].hp).toBe(3);
    expect(CARDS[cardId].desc).toBe('New desc');
    for (const key of Object.keys(CARDS)) {
      if (CARDS[key]?.id === cardId) {
        delete CARDS[key];
      }
    }
  });

  it('сливает шаблон противника с существующей картой и делится псевдонимами', () => {
    const original = CARDS.FIRE_FLAME_MAGUS;
    expect(original).toBeTruthy();
    const originalName = original.name;
    mergeExternalCardTemplates([{ id: 'fire_flame_magus', atk: 99, artHint: 'net' }]);
    expect(CARDS.FIRE_FLAME_MAGUS).toBe(original);
    expect(CARDS['fire_flame_magus']).toBe(original);
    expect(original.name).toBe(originalName);
    expect(original.artHint).toBe('net');
    delete original.artHint;
    delete CARDS['fire_flame_magus'];
  });
});
