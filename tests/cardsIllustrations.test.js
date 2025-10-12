import { describe, it, expect } from 'vitest';
import { getIllustrationLookupKeys } from '../src/scene/cards.js';

describe('getIllustrationLookupKeys', () => {
  it('возвращает варианты в обоих регистрах для tplId', () => {
    const keys = getIllustrationLookupKeys({ id: 'fire_flame_magus' });
    expect(keys).toContain('fire_flame_magus');
    expect(keys).toContain('FIRE_FLAME_MAGUS');
  });

  it('учитывает нормализованное имя и альтернативные разделители', () => {
    const keys = getIllustrationLookupKeys({ name: 'Imperial Guard' });
    expect(keys).toContain('imperial_guard');
    expect(keys).toContain('imperial-guard');
    expect(keys).toContain('IMPERIAL_GUARD');
  });
});
