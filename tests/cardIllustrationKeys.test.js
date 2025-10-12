import { describe, it, expect } from 'vitest';
import { getIllustrationLookupKeys } from '../src/scene/cards.js';

describe('getIllustrationLookupKeys', () => {
  it('возвращает варианты регистра идентификатора', () => {
    const keys = getIllustrationLookupKeys({ id: 'fire_flame_magus' });
    expect(keys).toContain('fire_flame_magus');
    expect(keys).toContain('FIRE_FLAME_MAGUS');
  });

  it('учитывает tplId и cardId, если id отсутствует', () => {
    const keys = getIllustrationLookupKeys({ tplId: 'Forest_Fairy', cardId: 'forest_fairy_card' });
    expect(keys).toContain('Forest_Fairy');
    expect(keys).toContain('FOREST_FAIRY');
    expect(keys).toContain('forest_fairy_card');
  });

  it('нормализует название карты в формат с подчёркиваниями и дефисами', () => {
    const keys = getIllustrationLookupKeys({ name: 'Partmole Flame Guard!' });
    expect(keys).toContain('partmole_flame_guard');
    expect(keys).toContain('partmole-flame-guard');
  });
});
