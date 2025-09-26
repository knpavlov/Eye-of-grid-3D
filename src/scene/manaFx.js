// Вспомогательные функции для планирования анимаций прироста маны
export function buildManaGainPlan({
  playersBefore = [],
  deaths = [],
  manaGainEntries = [],
  tileMeshes = [],
  THREE = (typeof window !== 'undefined' ? window.THREE : null),
  baseDelayMs = 240,
  abilityOffsetMs = 160,
  deathDelayBetweenMs = 300,
  abilityDelayBetweenMs = 300,
  minEventDurationMs = 720,
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
    const abilityDelayByOwner = new Map();
    const getAbilityDelay = (owner) => {
      const used = abilityDelayByOwner.get(owner) || 0;
      abilityDelayByOwner.set(owner, used + abilityOffsetMs);
      return baseDelayMs + abilityOffsetMs + used;
    };
    const events = [];
    const ownerTimelineMs = new Map();
    const abilityGroups = new Map();
    const standaloneAbilities = [];

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

    const addEvent = (owner, origin, amount, slotStart, startDelay, perOrbDelay) => {
      if (!origin || !Number.isFinite(owner)) return;
      const normalizedAmount = Math.max(0, Math.floor(amount));
      if (normalizedAmount <= 0) return;
      const clampedSlot = Math.max(0, Math.min(9, Number.isFinite(slotStart) ? slotStart : 0));
      const originClone = typeof origin.clone === 'function' ? origin.clone() : origin;
      const slots = [];
      for (let i = 0; i < normalizedAmount; i += 1) {
        const slotIdx = Math.max(0, Math.min(9, clampedSlot + i));
        slots.push(slotIdx);
      }
      const baseStart = Number.isFinite(startDelay) ? Math.max(0, startDelay) : 0;
      const delayBetween = Number.isFinite(perOrbDelay)
        ? Math.max(0, perOrbDelay)
        : deathDelayBetweenMs;
      const currentTimeline = ownerTimelineMs.get(owner) || 0;
      const scheduledStart = Math.max(baseStart, currentTimeline);
      const minDuration = Math.max(minEventDurationMs, delayBetween * Math.max(1, normalizedAmount));
      const endOfEvent = scheduledStart + minDuration;
      ownerTimelineMs.set(owner, endOfEvent);
      events.push({
        owner,
        origin: originClone,
        amount: normalizedAmount,
        slotStart: clampedSlot,
        slots,
        startDelayMs: scheduledStart,
        delayBetweenMs: delayBetween,
        eventDurationMs: minDuration,
      });
    };

    const prepareAbilityGroups = () => {
      for (const entry of (Array.isArray(manaGainEntries) ? manaGainEntries : [])) {
        try {
          const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
          if (owner == null) continue;
          const key = makeKey(entry?.death);
          if (key) {
            if (!abilityGroups.has(key)) abilityGroups.set(key, []);
            abilityGroups.get(key).push(entry);
          } else {
            standaloneAbilities.push(entry);
          }
        } catch {}
      }
    };

    prepareAbilityGroups();

    const scheduleAbilityEntry = (entry) => {
      try {
        const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
        if (owner == null) return;
        const rawAmount = Number(entry?.amount);
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;
        const state = ensureOwnerState(owner);
        if (!state || state.nextSlot >= 10) return;
        const death = entry?.death;
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
        if (!origin) return;
        const capacity = Math.max(0, Math.min(Math.floor(rawAmount), 10 - state.nextSlot));
        if (capacity <= 0) return;
        addEvent(owner, origin, capacity, state.nextSlot, getAbilityDelay(owner), abilityDelayBetweenMs);
        state.nextSlot = Math.min(10, state.nextSlot + capacity);
      } catch (err) {
        console.error('[manaFx] Ошибка при планировании бонусной маны:', err);
      }
    };

    const processAbilityForDeath = (death) => {
      const key = makeKey(death);
      if (!key || !abilityGroups.has(key)) return;
      const list = abilityGroups.get(key);
      abilityGroups.delete(key);
      if (!Array.isArray(list)) return;
      for (const abilityEntry of list) {
        if (abilityEntry && !abilityEntry.death) {
          abilityEntry.death = death;
        }
        scheduleAbilityEntry(abilityEntry);
      }
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
        addEvent(owner, origin, 1, baseSlot, baseDelayMs, deathDelayBetweenMs);
      }
      state.nextSlot = Math.min(10, baseSlot + (hasCapacity ? 1 : 0));
      processAbilityForDeath(death);
    };

    deaths.forEach(processDeath);

    for (const leftover of abilityGroups.values()) {
      if (!Array.isArray(leftover)) continue;
      for (const entry of leftover) {
        scheduleAbilityEntry(entry);
      }
    }

    for (const entry of standaloneAbilities) {
      scheduleAbilityEntry(entry);
    }

    const schedule = () => {
      if (!events.length) return;
      if (typeof window !== 'undefined' && window.gameState && Array.isArray(window.gameState.players)) {
        for (const [ownerIdx] of ownerState.entries()) {
          try {
            const before = initialMana.has(ownerIdx) ? initialMana.get(ownerIdx) : null;
            const player = window.gameState.players[ownerIdx];
            if (!player || before == null) continue;
            if (Number.isFinite(player.mana) && player.mana > before) {
              if (!Number.isFinite(player._beforeMana) || player._beforeMana < before) {
                player._beforeMana = before;
              }
            }
          } catch (err) {
            console.error('[manaFx] Ошибка при установке _beforeMana:', err);
          }
        }
      }
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
            count: 1,
            startDelayMs: ev.startDelayMs,
            flightDurationMs: Math.max(420, Number(ev.eventDurationMs) || minEventDurationMs),
            reserveImmediately: true,
            slotSequence: Array.isArray(ev.slots) ? ev.slots.slice() : undefined,
            panelSlots: Array.isArray(ev.slots) ? ev.slots.slice() : undefined,
            manaAmount: ev.amount,
            labelHoldMs: 340,
            riseHeight: 150,
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
