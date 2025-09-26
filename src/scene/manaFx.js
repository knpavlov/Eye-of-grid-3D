// Вспомогательные функции для планирования анимаций прироста маны
export function buildManaGainPlan({
  playersBefore = [],
  deaths = [],
  manaGainEntries = [],
  tileMeshes = [],
  THREE = (typeof window !== 'undefined' ? window.THREE : null),
  baseDelayMs = 400,
  abilityOffsetMs = 160,
  riseDurationMs = 1000,
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
    const aggregates = new Map();
    const abilityDelayByOwner = new Map();
    const events = [];

    const makeKey = (death) => {
      if (!death) return null;
      return `${death.owner}:${death.r}:${death.c}`;
    };

    const ensureOwnerState = (owner) => {
      if (!Number.isFinite(owner)) return null;
      if (!ownerState.has(owner)) {
        const start = initialMana.has(owner) ? initialMana.get(owner) : 0;
        ownerState.set(owner, { nextValue: Math.max(0, Math.min(10, start)) });
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

    const ensureAggregate = (death) => {
      if (!death || !Number.isFinite(death.owner)) return null;
      const key = makeKey(death);
      if (!key) return null;
      if (!aggregates.has(key)) {
        const origin = resolveOrigin(death);
        if (origin) {
          deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
        }
        aggregates.set(key, {
          owner: death.owner,
          origin: deathOrigins.get(key) || null,
          contributions: [],
          startDelayMs: baseDelayMs,
          death,
        });
      } else if (!deathOrigins.has(key)) {
        const origin = resolveOrigin(death);
        if (origin) {
          deathOrigins.set(key, typeof origin.clone === 'function' ? origin.clone() : origin);
        }
      }
      const agg = aggregates.get(key);
      if (agg && !agg.origin && deathOrigins.has(key)) {
        const stored = deathOrigins.get(key);
        agg.origin = typeof stored.clone === 'function' ? stored.clone() : stored;
      }
      return agg || null;
    };

    const processDeath = (death) => {
      if (!death || !Number.isFinite(death.owner)) return;
      const agg = ensureAggregate(death);
      if (!agg) return;
      agg.contributions.push({ amount: 1, delay: baseDelayMs, type: 'BASE' });
      agg.startDelayMs = Math.max(agg.startDelayMs, baseDelayMs);
    };

    deaths.forEach(processDeath);

    const getAbilityDelay = (owner) => {
      const used = abilityDelayByOwner.get(owner) || 0;
      abilityDelayByOwner.set(owner, used + abilityOffsetMs);
      return baseDelayMs + abilityOffsetMs + used;
    };

    for (const entry of (Array.isArray(manaGainEntries) ? manaGainEntries : [])) {
      const owner = Number.isFinite(entry?.owner) ? entry.owner : null;
      if (owner == null) continue;
      const rawAmount = Number(entry?.amount);
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;
      const death = entry.death;
      const agg = ensureAggregate(death);
      if (!agg) continue;
      const delay = getAbilityDelay(owner);
      agg.contributions.push({ amount: rawAmount, delay, type: entry.type || 'ABILITY' });
      agg.startDelayMs = Math.max(agg.startDelayMs, delay);
    }

    const processed = new Set();
    for (const death of deaths) {
      const key = makeKey(death);
      if (!key || processed.has(key)) continue;
      processed.add(key);
      const agg = aggregates.get(key);
      if (!agg) continue;
      const owner = agg.owner;
      const state = ensureOwnerState(owner);
      if (!state) continue;
      const totalPlanned = agg.contributions.reduce((sum, item) => {
        const val = Number.isFinite(item?.amount) ? Math.floor(item.amount) : 0;
        return sum + Math.max(0, val);
      }, 0);
      if (totalPlanned <= 0) continue;
      const before = state.nextValue;
      const gain = Math.max(0, Math.min(totalPlanned, 10 - before));
      if (gain <= 0) continue;
      const after = before + gain;
      state.nextValue = after;
      const startDelay = Number.isFinite(agg.startDelayMs) ? Math.max(0, agg.startDelayMs) : baseDelayMs;
      const origin = agg.origin;
      if (!origin) continue;
      events.push({
        owner,
        origin: typeof origin.clone === 'function' ? origin.clone() : origin,
        amount: gain,
        before,
        after,
        startDelayMs: startDelay,
        riseDurationMs,
      });
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
            amount: ev.amount,
            before: ev.before,
            after: ev.after,
            startDelayMs: ev.startDelayMs,
            floatDurationMs: ev.riseDurationMs,
            labelText: `+${ev.amount}`,
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
