// Вспомогательные функции для планирования анимаций прироста маны
export function buildManaGainPlan({
  playersBefore = [],
  deaths = [],
  manaGainEntries = [],
  tileMeshes = [],
  THREE = (typeof window !== 'undefined' ? window.THREE : null),
  baseDelayMs = 240,
  perOrbDelayMs = 300,
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
    const events = [];

    const makeKey = (death) => {
      if (!death) return null;
      return `${death.owner}:${death.r}:${death.c}`;
    };

    const ensureOwnerState = (owner) => {
      if (!Number.isFinite(owner)) return null;
      if (!ownerState.has(owner)) {
        const start = initialMana.has(owner) ? initialMana.get(owner) : 0;
        ownerState.set(owner, {
          nextSlot: Math.max(0, Math.min(10, start)),
          nextAvailableMs: baseDelayMs,
        });
      }
      const state = ownerState.get(owner);
      if (state.nextAvailableMs == null || !Number.isFinite(state.nextAvailableMs)) {
        state.nextAvailableMs = baseDelayMs;
      }
      return state;
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

    const addEvent = (owner, origin, amount, slotStart, startDelay) => {
      if (!origin || !Number.isFinite(owner)) return;
      const normalizedAmount = Math.max(0, Math.floor(amount));
      if (normalizedAmount <= 0) return;
      const clampedSlot = Math.max(0, Math.min(9, Number.isFinite(slotStart) ? slotStart : 0));
      const originClone = typeof origin.clone === 'function' ? origin.clone() : origin;
      events.push({
        owner,
        origin: originClone,
        amount: normalizedAmount,
        slotStart: clampedSlot,
        startDelayMs: Number.isFinite(startDelay) ? Math.max(0, startDelay) : 0,
        delayBetweenMs: perOrbDelayMs,
      });
      return normalizedAmount;
    };

    const queueFromOrigin = (owner, state, origin, amount, slotStart) => {
      if (!state || !origin) return 0;
      const plannedAmount = Math.max(0, Math.floor(amount));
      if (plannedAmount <= 0) return 0;
      const startDelay = Math.max(baseDelayMs, Number.isFinite(state.nextAvailableMs) ? state.nextAvailableMs : baseDelayMs);
      const scheduled = addEvent(owner, origin, plannedAmount, slotStart, startDelay) || 0;
      if (scheduled > 0) {
        state.nextAvailableMs = startDelay + perOrbDelayMs * scheduled;
      }
      return scheduled;
    };

    const processDeath = (death) => {
      if (!death || !Number.isFinite(death.owner)) return;
      const owner = death.owner;
      const state = ensureOwnerState(owner);
      if (!state) return;
      const baseSlot = state.nextSlot;
      const hasCapacity = baseSlot < 10;
      const origin = resolveOrigin(death);
      const key = makeKey(death);
      if (origin && key) {
        deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
      }
      let emitted = 0;
      if (origin && hasCapacity) {
        emitted = queueFromOrigin(owner, state, origin, 1, baseSlot);
      }
      const gain = hasCapacity ? 1 : 0;
      state.nextSlot = Math.min(10, baseSlot + gain);
      if (emitted <= 0 && hasCapacity) {
        state.nextAvailableMs = Math.max(baseDelayMs, state.nextAvailableMs || baseDelayMs) + perOrbDelayMs;
      }
    };

    deaths.forEach(processDeath);

    for (const entry of (Array.isArray(manaGainEntries) ? manaGainEntries : [])) {
      const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
      if (owner == null) continue;
      const rawAmount = Number(entry?.amount);
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;
      const state = ensureOwnerState(owner);
      if (!state || state.nextSlot >= 10) continue;
      const death = entry.death;
      let origin = null;
      const key = makeKey(death);
      if (key && deathOrigins.has(key)) {
        origin = deathOrigins.get(key);
      } else {
        origin = resolveOrigin(death);
        if (origin && key) {
          deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
        }
      }
      const capacity = Math.max(0, Math.min(Math.floor(rawAmount), 10 - state.nextSlot));
      if (capacity <= 0) continue;
      const slotStart = state.nextSlot;
      if (!origin) {
        state.nextSlot = Math.min(10, slotStart + capacity);
        state.nextAvailableMs = Math.max(baseDelayMs, state.nextAvailableMs || baseDelayMs) + perOrbDelayMs * capacity;
        continue;
      }
      const emitted = queueFromOrigin(owner, state, origin, capacity, slotStart);
      state.nextSlot = Math.min(10, slotStart + capacity);
      if (emitted <= 0) {
        state.nextAvailableMs = Math.max(baseDelayMs, state.nextAvailableMs || baseDelayMs) + perOrbDelayMs * capacity;
      }
    }

    const schedule = () => {
      if (!events.length) return;
      const animate = (typeof window !== 'undefined')
        ? (window.animateManaGainFromWorld || window.__ui?.mana?.animateManaGainFromWorld)
        : null;
      if (typeof animate !== 'function') return;
      const ordered = events.slice().sort((a, b) => {
        if (a.startDelayMs !== b.startDelayMs) return a.startDelayMs - b.startDelayMs;
        if (a.owner !== b.owner) return a.owner - b.owner;
        return a.slotStart - b.slotStart;
      });
      for (const ev of ordered) {
        try {
          const origin = ev.origin && typeof ev.origin.clone === 'function' ? ev.origin.clone() : ev.origin;
          animate(origin, ev.owner, true, ev.slotStart, {
            count: ev.amount,
            startDelayMs: ev.startDelayMs,
            delayBetweenMs: ev.delayBetweenMs,
            reserveImmediately: true,
            flightEase: 'power3.in',
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
