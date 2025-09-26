// Вспомогательные функции для планирования анимаций прироста маны
export function buildManaGainPlan({
  playersBefore = [],
  deaths = [],
  manaGainEntries = [],
  tileMeshes = [],
  THREE = (typeof window !== 'undefined' ? window.THREE : null),
  baseDelayMs = 400,
  abilityOffsetMs = 160,
} = {}) {
  try {
    const initialMana = new Map();
    if (Array.isArray(playersBefore)) {
      playersBefore.forEach((pl, idx) => {
        const value = Number.isFinite(pl?.mana) ? pl.mana : 0;
        initialMana.set(idx, Math.max(0, Math.min(10, value)));
      });
    }

    const ownerState = new Map();
    const deathOrigins = new Map();
    const abilityTotals = new Map();
    const events = [];

    const makeKey = (death) => {
      if (!death) return null;
      return `${death.owner}:${death.r}:${death.c}`;
    };

    const ensureOwnerState = (owner) => {
      if (!Number.isFinite(owner)) return null;
      if (!ownerState.has(owner)) {
        const start = initialMana.has(owner) ? initialMana.get(owner) : 0;
        ownerState.set(owner, { nextSlot: Math.max(0, Math.min(10, start)) });
      }
      return ownerState.get(owner);
    };

    const resolveOrigin = (death) => {
      try {
        if (!death || !Number.isFinite(death.r) || !Number.isFinite(death.c)) return null;
        const row = death.r;
        const col = death.c;
        const tile = tileMeshes?.[row]?.[col];
        const basePos = tile?.position;
        if (!basePos || typeof basePos.clone !== 'function') return null;
        const result = basePos.clone();
        if (THREE && THREE.Vector3) {
          result.add(new THREE.Vector3(0, 1.2, 0));
        } else if ('y' in result) {
          result.y += 1.2;
        }
        return result;
      } catch {
        return null;
      }
    };

    const registerEvent = (owner, death, origin, amount, startDelay) => {
      if (!origin || !Number.isFinite(owner)) return;
      const normalizedAmount = Math.max(0, Math.floor(amount));
      if (normalizedAmount <= 0) return;
      const originClone = typeof origin.clone === 'function' ? origin.clone() : origin;
      events.push({
        owner,
        origin: originClone,
        amount: normalizedAmount,
        startDelayMs: Number.isFinite(startDelay) ? Math.max(0, startDelay) : 0,
      });
      const key = makeKey(death);
      if (key) {
        deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
      }
    };

    for (const entry of (Array.isArray(manaGainEntries) ? manaGainEntries : [])) {
      const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
      const amount = Math.max(0, Math.floor(Number(entry?.amount) || 0));
      const key = makeKey(entry?.death);
      if (owner == null || !key || amount <= 0) continue;
      const mapKey = `${owner}|${key}`;
      abilityTotals.set(mapKey, (abilityTotals.get(mapKey) || 0) + amount);
    }

    for (const death of (Array.isArray(deaths) ? deaths : [])) {
      if (!death || !Number.isFinite(death.owner)) continue;
      const owner = death.owner;
      const state = ensureOwnerState(owner);
      if (!state) continue;
      const key = makeKey(death);
      const abilityKey = key ? `${owner}|${key}` : null;
      const abilityGain = abilityKey ? (abilityTotals.get(abilityKey) || 0) : 0;
      const origin = resolveOrigin(death);
      if (origin && key && !deathOrigins.has(key)) {
        deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
      }
      const capacity = Math.max(0, 10 - state.nextSlot);
      if (capacity <= 0) continue;
      const baseGain = state.nextSlot < 10 ? 1 : 0;
      let total = Math.max(0, Math.min(capacity, baseGain + abilityGain));
      if (total <= 0 || !origin) continue;
      state.nextSlot = Math.min(10, state.nextSlot + total);
      const startDelay = baseDelayMs + (abilityGain > 0 ? abilityOffsetMs : 0);
      registerEvent(owner, death, origin, total, startDelay);
    }

    const schedule = () => {
      if (!events.length) return;
      const animate = (typeof window !== 'undefined')
        ? (window.animateManaGainFromWorld || window.__ui?.mana?.animateManaGainFromWorld)
        : null;
      if (typeof animate !== 'function') return;
      for (const ev of events) {
        try {
          const origin = ev.origin && typeof ev.origin.clone === 'function' ? ev.origin.clone() : ev.origin;
          animate(origin, ev.owner, true, null, {
            count: ev.amount,
            startDelayMs: ev.startDelayMs,
          });
        } catch (err) {
          console.error('[manaFx] Не удалось запустить анимацию маны:', err);
        }
      }
    };

    const getOrigin = (death) => {
      const key = makeKey(death);
      if (!key) return null;
      const origin = deathOrigins.get(key);
      if (!origin) return null;
      return typeof origin.clone === 'function' ? origin.clone() : origin;
    };

    return { events, schedule, getOrigin };
  } catch (err) {
    console.error('[manaFx] Ошибка при подготовке плана маны:', err);
    return { events: [], schedule: () => {}, getOrigin: () => null };
  }
}

export default { buildManaGainPlan };
