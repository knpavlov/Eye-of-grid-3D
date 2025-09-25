import { describe, it, expect } from 'vitest';
import { discardCardFromHand, discardRandomHandCard, removeHandCard } from '../src/core/discardUtils.js';

describe('discardUtils', () => {
  it('удаляет карту из руки и возвращает её', () => {
    const player = { hand: [{ id: 'A' }, { id: 'B' }], graveyard: [] };
    const removed = removeHandCard(player, 0);
    expect(removed).toEqual({ id: 'A' });
    expect(player.hand).toEqual([{ id: 'B' }]);
  });

  it('отправляет карту в кладбище при discardCardFromHand', () => {
    const player = { hand: [{ id: 'X' }], graveyard: [] };
    const removed = discardCardFromHand(player, 0);
    expect(removed).toEqual({ id: 'X' });
    expect(player.hand).toEqual([]);
    expect(player.graveyard).toEqual([{ id: 'X' }]);
  });

  it('возвращает null при неверном индексе', () => {
    const player = { hand: [{ id: 'X' }], graveyard: [] };
    const removed = discardCardFromHand(player, 5);
    expect(removed).toBeNull();
    expect(player.hand).toEqual([{ id: 'X' }]);
  });

  it('discardRandomHandCard выбирает валидный индекс', () => {
    const player = { hand: [{ id: 1 }, { id: 2 }, { id: 3 }], graveyard: [] };
    const { card, index } = discardRandomHandCard(player, () => 0.6);
    expect(index).toBe(1);
    expect(card).toEqual({ id: 2 });
    expect(player.hand.length).toBe(2);
    expect(player.graveyard.length).toBe(1);
  });
});
