// Вспомогательные функции для планирования анимаций прироста маны
export function buildManaGainPlan({
  playersBefore = [],
  deaths = [],
  manaGainEntries = [],
  tileMeshes = [],
  THREE = (typeof window !== 'undefined' ? window.THREE : null),
  baseDelayMs = 220,
  abilityOffsetMs = 0,
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
          // timeCursorMs хранит целевое "время" запуска следующего орба, чтобы события шли цепочкой
          timeCursorMs: Math.max(0, baseDelayMs),
        });
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

    const addEvent = (owner, origin, amount, slotStart, desiredStart) => {
      if (!origin || !Number.isFinite(owner)) return;
      const normalizedAmount = Math.max(0, Math.floor(amount));
      if (normalizedAmount <= 0) return;
      const state = ensureOwnerState(owner);
      if (!state) return;
      const clampedSlot = Math.max(0, Math.min(9, Number.isFinite(slotStart) ? slotStart : 0));
      const originClone = typeof origin.clone === 'function' ? origin.clone() : origin;
      const requestedStart = Number.isFinite(desiredStart) ? Math.max(0, desiredStart) : state.timeCursorMs;
      const startDelayMs = Math.max(requestedStart, state.timeCursorMs);
      events.push({
        owner,
        origin: originClone,
        amount: normalizedAmount,
        slotStart: clampedSlot,
        startDelayMs,
        delayBetweenMs: perOrbDelayMs,
      });
      // Сдвигаем курсор по времени, чтобы следующий запуск ждал 300 мс после предыдущего орба
      const totalDuration = perOrbDelayMs * normalizedAmount;
      state.timeCursorMs = startDelayMs + totalDuration;
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
      if (origin && hasCapacity) {
        addEvent(owner, origin, 1, baseSlot, state.timeCursorMs);
      }
      state.nextSlot = Math.min(10, baseSlot + (hasCapacity ? 1 : 0));
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
      if (!origin) continue;
      const capacity = Math.max(0, Math.min(Math.floor(rawAmount), 10 - state.nextSlot));
      if (capacity <= 0) continue;
      const desiredStart = state.timeCursorMs + Math.max(0, abilityOffsetMs);
      addEvent(owner, origin, capacity, state.nextSlot, desiredStart);
      state.nextSlot = Math.min(10, state.nextSlot + capacity);
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
