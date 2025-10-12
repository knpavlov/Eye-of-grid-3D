import { describe, it, expect } from 'vitest';
import { resolveUnitCardInfo, resolveCardReference, normalizeArtRef } from '../src/scene/cardDataResolver.js';

const SAMPLE_DB = {
  FIRE_FLAME_MAGUS: {
    id: 'FIRE_FLAME_MAGUS',
    name: 'Flame Magus',
    type: 'UNIT',
    element: 'FIRE',
    cost: 1,
    activation: 1,
    atk: 1,
    hp: 1,
    desc: 'Test desc',
  },
  WATER_SWORDFISH: {
    id: 'WATER_SWORDFISH',
    name: 'Swordfish',
    type: 'UNIT',
    element: 'WATER',
    cost: 2,
    activation: 2,
    atk: 2,
    hp: 3,
    desc: 'Water desc',
  },
};

describe('resolveCardReference', () => {
  it('возвращает шаблон из базы по строковому id', () => {
    const { cardData, artRef } = resolveCardReference('FIRE_FLAME_MAGUS', { cardsDb: SAMPLE_DB });
    expect(cardData).toBeTruthy();
    expect(cardData?.name).toBe('Flame Magus');
    expect(artRef?.id).toBe('FIRE_FLAME_MAGUS');
  });

  it('объединяет частичный объект карты с базовым шаблоном', () => {
    const partial = { id: 'WATER_SWORDFISH', atk: 4, hp: 5 };
    const { cardData } = resolveCardReference(partial, { cardsDb: SAMPLE_DB });
    expect(cardData?.atk).toBe(4);
    expect(cardData?.hp).toBe(5);
    expect(cardData?.cost).toBe(2);
    expect(cardData?.name).toBe('Swordfish');
  });
});

describe('resolveUnitCardInfo', () => {
  it('находит шаблон через tplId юнита', () => {
    const unit = { owner: 0, tplId: 'FIRE_FLAME_MAGUS' };
    const { cardData, artRef } = resolveUnitCardInfo(unit, { cardsDb: SAMPLE_DB });
    expect(cardData?.name).toBe('Flame Magus');
    expect(cardData?.element).toBe('FIRE');
    expect(artRef?.id).toBe('FIRE_FLAME_MAGUS');
  });

  it('использует вложенный объект card, даже если tplId отсутствует', () => {
    const unit = {
      owner: 1,
      card: { id: 'WATER_SWORDFISH', atk: 6, hp: 7, name: 'Swordfish Custom', type: 'UNIT' },
    };
    const { cardData, artRef } = resolveUnitCardInfo(unit, { cardsDb: SAMPLE_DB });
    expect(cardData?.atk).toBe(6);
    expect(cardData?.hp).toBe(7);
    expect(cardData?.cost).toBe(2);
    expect(cardData?.name).toBe('Swordfish Custom');
    expect(artRef?.id).toBe('WATER_SWORDFISH');
  });

  it('создаёт заглушку, если данных недостаточно', () => {
    const unit = { owner: 1 };
    const { cardData, artRef } = resolveUnitCardInfo(unit, { cardsDb: {} });
    expect(cardData?.id).toBeDefined();
    expect(cardData?.type).toBe('UNIT');
    expect(artRef).toBeNull();
  });
});

describe('normalizeArtRef', () => {
  it('нормализует строку в объект с id', () => {
    expect(normalizeArtRef(' FIRE_FLAME_MAGUS ')).toEqual({ id: 'FIRE_FLAME_MAGUS' });
  });

  it('вытягивает id из объекта', () => {
    expect(normalizeArtRef({ tplId: 'WATER_SWORDFISH' })).toEqual({ id: 'WATER_SWORDFISH' });
  });
});
