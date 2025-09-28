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
    const abilityDelayByOwner = new Map();
    const events = [];
    const bonusByDeath = new Map();
    const directEntries = [];

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

    const resolveSource = (entry) => {
      try {
        if (!entry) return null;
        if (entry.origin && typeof entry.origin.clone === 'function') {
          return entry.origin.clone();
        }
        if (entry.origin && typeof entry.origin === 'object' && 'x' in entry.origin) {
          if (THREE && THREE.Vector3) {
            const vec = new THREE.Vector3(
              Number(entry.origin.x) || 0,
              Number(entry.origin.y) || 0,
              Number(entry.origin.z) || 0,
            );
            return vec;
          }
          return { ...entry.origin };
        }
        const ref = entry.source || entry;
        const row = Number.isFinite(ref?.r) ? ref.r : Number.isFinite(entry?.r) ? entry.r : null;
        const col = Number.isFinite(ref?.c) ? ref.c : Number.isFinite(entry?.c) ? entry.c : null;
        if (row == null || col == null) return null;
        return resolveOrigin({ r: row, c: col });
      } catch {
        return null;
      }
    };

    for (const entry of (Array.isArray(manaGainEntries) ? manaGainEntries : [])) {
      const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
      if (owner == null) continue;
      const rawAmount = Number(entry?.amount);
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;
      const amount = Math.max(0, Math.floor(rawAmount));
      if (amount <= 0) continue;
      const key = makeKey(entry.death);
      if (key) {
        const current = bonusByDeath.get(key) || { owner, amount: 0 };
        current.amount += amount;
        bonusByDeath.set(key, current);
        continue;
      }
      const src = entry?.source || null;
      const row = Number.isFinite(entry?.r) ? entry.r : Number.isFinite(src?.r) ? src.r : null;
      const col = Number.isFinite(entry?.c) ? entry.c : Number.isFinite(src?.c) ? src.c : null;
      directEntries.push({
        owner,
        amount,
        source: src,
        r: row,
        c: col,
        origin: entry?.origin,
        startDelayMs: Number.isFinite(entry?.startDelayMs) ? entry.startDelayMs : null,
      });
    }

    const getAbilityDelay = (owner, hasBonus) => {
      if (!hasBonus) return baseDelayMs;
      const used = abilityDelayByOwner.get(owner) || 0;
      abilityDelayByOwner.set(owner, used + abilityOffsetMs);
      return baseDelayMs + abilityOffsetMs + used;
    };

    const processDeath = (death) => {
      if (!death || !Number.isFinite(death.owner)) return;
      const owner = death.owner;
      const state = ensureOwnerState(owner);
      if (!state) return;
      const key = makeKey(death);
      const origin = resolveOrigin(death);
      if (origin && key) {
        deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
      }
      if (!origin) return;

      const bonus = bonusByDeath.get(key)?.amount || 0;
      const currentSlot = state.nextSlot;
      const capacityLeft = Math.max(0, 10 - currentSlot);
      const baseGain = capacityLeft > 0 ? 1 : 0;
      const totalWanted = baseGain + bonus;
      if (totalWanted <= 0) {
        return;
      }
      const actualGain = Math.max(0, Math.min(totalWanted, capacityLeft));
      if (actualGain <= 0) {
        return;
      }
      const eventStart = getAbilityDelay(owner, bonus > 0);
      events.push({
        owner,
        origin: typeof origin.clone === 'function' ? origin.clone() : origin,
        amount: actualGain,
        slotStart: currentSlot,
        startDelayMs: eventStart,
      });
      state.nextSlot = Math.min(10, currentSlot + actualGain);
    };

    deaths.forEach(processDeath);

    for (const direct of directEntries) {
      if (!Number.isFinite(direct.owner)) continue;
      const state = ensureOwnerState(direct.owner);
      if (!state) continue;
      const origin = resolveSource(direct);
      if (!origin) continue;
      const currentSlot = state.nextSlot;
      const capacityLeft = Math.max(0, 10 - currentSlot);
      if (capacityLeft <= 0) continue;
      const actualGain = Math.max(0, Math.min(direct.amount, capacityLeft));
      if (actualGain <= 0) continue;
      const startDelay = direct.startDelayMs != null
        ? direct.startDelayMs
        : getAbilityDelay(direct.owner, true);
      events.push({
        owner: direct.owner,
        origin: typeof origin.clone === 'function' ? origin.clone() : origin,
        amount: actualGain,
        slotStart: currentSlot,
        startDelayMs: startDelay,
      });
      state.nextSlot = Math.min(10, currentSlot + actualGain);
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
          animate(origin, ev.owner, {
            amount: ev.amount,
            startDelayMs: ev.startDelayMs,
            visualOnly: true,
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
