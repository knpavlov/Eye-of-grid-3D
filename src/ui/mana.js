// Mana bar rendering and animations
import { worldToScreen } from '../scene/index.js';

const FALLBACK_PENDING_STATE = {
  counts: [0, 0],
  slots: [new Set(), new Set()],
  anonymous: [0, 0],
};

const activeFlightOwners = new Map();

function syncActiveFlightDebug() {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      0: Math.max(0, activeFlightOwners.get(0) || 0),
      1: Math.max(0, activeFlightOwners.get(1) || 0),
    };
    window.__manaActiveFlights = payload;
  } catch {}
}

function incrementActiveFlights(owner, amount = 1) {
  if (!Number.isFinite(owner)) return;
  const current = activeFlightOwners.get(owner) || 0;
  const next = Math.max(0, current + Math.max(1, Math.floor(amount)));
  activeFlightOwners.set(owner, next);
  syncActiveFlightDebug();
}

function decrementActiveFlights(owner, amount = 1) {
  if (!Number.isFinite(owner)) return;
  const current = activeFlightOwners.get(owner) || 0;
  const next = Math.max(0, current - Math.max(1, Math.floor(amount)));
  if (next <= 0) activeFlightOwners.delete(owner);
  else activeFlightOwners.set(owner, next);
  syncActiveFlightDebug();
}

function getActiveFlightCount(owner) {
  if (!Number.isFinite(owner)) return 0;
  return activeFlightOwners.get(owner) || 0;
}

const clampIndex = (value) => {
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.max(0, Math.min(9, normalized));
};

function reconcilePendingState(state) {
  if (!state) return state;
  const counts = Array.isArray(state.counts) ? state.counts : [0, 0];
  const slots = Array.isArray(state.slots) ? state.slots : [new Set(), new Set()];
  const anonymous = Array.isArray(state.anonymous) ? state.anonymous : [0, 0];

  state.counts = counts;
  state.slots = slots.map(s => (s instanceof Set ? s : new Set()));
  state.anonymous = anonymous;

  for (let owner = 0; owner < 2; owner += 1) {
    const slotSet = state.slots[owner];
    const reserveSize = slotSet instanceof Set ? slotSet.size : 0;
    const value = Math.max(0, Math.floor(counts?.[owner] ?? 0));
    const anon = Math.max(0, value - reserveSize);
    state.counts[owner] = reserveSize + anon;
    state.anonymous[owner] = anon;
  }
  return state;
}

function ensurePendingState() {
  if (typeof window === 'undefined') {
    return reconcilePendingState(FALLBACK_PENDING_STATE);
  }
  const w = window;
  if (!w.__pendingManaState) {
    const baseCounts = Array.isArray(w.PENDING_MANA_BLOCK)
      ? w.PENDING_MANA_BLOCK.slice(0, 2)
      : [0, 0];
    w.__pendingManaState = {
      counts: [Math.max(0, Math.floor(baseCounts[0] || 0)), Math.max(0, Math.floor(baseCounts[1] || 0))],
      slots: [new Set(), new Set()],
      anonymous: [0, 0],
    };
  } else if (Array.isArray(w.PENDING_MANA_BLOCK) && w.PENDING_MANA_BLOCK !== w.__pendingManaState.counts) {
    const [a, b] = w.PENDING_MANA_BLOCK;
    w.__pendingManaState.counts[0] = Math.max(0, Math.floor(a || 0));
    w.__pendingManaState.counts[1] = Math.max(0, Math.floor(b || 0));
  }
  reconcilePendingState(w.__pendingManaState);
  w.PENDING_MANA_BLOCK = w.__pendingManaState.counts;
  return w.__pendingManaState;
}

function syncPendingState(state) {
  const pending = reconcilePendingState(state || ensurePendingState());
  if (typeof window !== 'undefined') {
    window.__pendingManaState = pending;
    window.PENDING_MANA_BLOCK = pending.counts;
  }
  return pending;
}

function getBlocks() {
  const state = ensurePendingState();
  return state.counts;
}

function setBlocks(v) {
  const state = ensurePendingState();
  const arr = Array.isArray(v) ? v : [0, 0];
  for (let owner = 0; owner < 2; owner += 1) {
    const val = Math.max(0, Math.floor(arr[owner] || 0));
    const reserved = state.slots[owner]?.size || 0;
    state.counts[owner] = val;
    state.anonymous[owner] = Math.max(0, val - reserved);
  }
  syncPendingState(state);
}

function getAnim(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_ANIM) || null; } catch { return null; } }
function setAnim(v){ try { window.PENDING_MANA_ANIM = v; } catch {} }

// Sync with legacy flags
function getManaGainActive(){ try { return !!(typeof window !== 'undefined' && window.manaGainActive); } catch { return false; } }
function setManaGainActive(v){ try { if (typeof window !== 'undefined') { window.manaGainActive = !!v; } } catch {} }

function getPendingSlotSet(ownerIndex) {
  const state = ensurePendingState();
  const idx = Math.max(0, Math.min(1, Number(ownerIndex) || 0));
  return state.slots[idx];
}

function getPendingAnonymous(ownerIndex) {
  const state = ensurePendingState();
  const idx = Math.max(0, Math.min(1, Number(ownerIndex) || 0));
  return state.anonymous[idx] || 0;
}

function reserveIncomingOrbs(ownerIndex, slotIndices = [], fallbackCount = slotIndices.length) {
  if (!Number.isFinite(ownerIndex)) return;
  const state = ensurePendingState();
  const idx = Math.max(0, Math.min(1, Math.floor(ownerIndex)));
  const slotSet = state.slots[idx];
  let added = 0;
  if (Array.isArray(slotIndices)) {
    for (const raw of slotIndices) {
      const normalized = clampIndex(raw);
      if (normalized == null) continue;
      if (!slotSet.has(normalized)) {
        slotSet.add(normalized);
        added += 1;
      }
    }
  }
  const targetTotal = Math.max(added, Math.floor(fallbackCount) || 0);
  const anonAdd = Math.max(0, targetTotal - added);
  if (anonAdd > 0) {
    state.anonymous[idx] = Math.max(0, (state.anonymous[idx] || 0) + anonAdd);
  }
  state.counts[idx] = slotSet.size + (state.anonymous[idx] || 0);
  syncPendingState(state);
  try { if (typeof window !== 'undefined' && typeof window.updateUI === 'function') window.updateUI(); } catch {}
}

function releaseIncomingOrb(ownerIndex, slotIndex = null) {
  if (!Number.isFinite(ownerIndex)) return;
  const state = ensurePendingState();
  const idx = Math.max(0, Math.min(1, Math.floor(ownerIndex)));
  const slotSet = state.slots[idx];
  const normalized = clampIndex(slotIndex);
  let changed = false;
  if (normalized != null && slotSet.has(normalized)) {
    slotSet.delete(normalized);
    changed = true;
  } else if ((state.anonymous[idx] || 0) > 0) {
    state.anonymous[idx] -= 1;
    changed = true;
  }
  if (!changed) return;
  state.counts[idx] = slotSet.size + (state.anonymous[idx] || 0);
  syncPendingState(state);
  try { if (typeof window !== 'undefined' && typeof window.updateUI === 'function') window.updateUI(); } catch {}
}

function resetPendingState(ownerIndex = null) {
  const state = ensurePendingState();
  const targets = (ownerIndex == null)
    ? [0, 1]
    : [Math.max(0, Math.min(1, Math.floor(ownerIndex)))];
  for (const idx of targets) {
    state.counts[idx] = 0;
    state.anonymous[idx] = 0;
    state.slots[idx].clear();
  }
  syncPendingState(state);
  try { if (typeof window !== 'undefined' && typeof window.updateUI === 'function') window.updateUI(); } catch {}
}

function ensureManaSlots(container, total) {
  if (!container) return [];
  const children = Array.from(container.children || []);
  if (children.length === total) {
    return children.map(child => {
      if (!child.dataset) child.dataset = {};
      if (!('filled' in child.dataset)) child.dataset.filled = child.classList.contains('mana-orb') ? '1' : '0';
      if (!('pending' in child.dataset)) child.dataset.pending = child.classList.contains('pending') ? '1' : '0';
      return child;
    });
  }
  container.innerHTML = '';
  const result = [];
  for (let i = 0; i < total; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'mana-slot';
    slot.dataset.filled = '0';
    slot.dataset.pending = '0';
    container.appendChild(slot);
    result.push(slot);
  }
  return result;
}

// Создаём визуальный орб-душу, вылетающий из существа
function createSoulOrbElement(start) {
  const orb = document.createElement('div');
  orb.className = 'mana-soul-orb';
  orb.style.position = 'fixed';
  orb.style.left = `${start.x}px`;
  orb.style.top = `${start.y}px`;
  orb.style.transform = 'translate(-50%, -50%) scale(0.35)';
  orb.style.opacity = '0';
  orb.style.pointerEvents = 'none';
  orb.style.zIndex = '80';
  return orb;
}

// Анимация стремительного вылета орба вверх и затухания
function playSoulOrbRiseEffect(start, { durationMs = 500, riseHeight = 140, labelText = null, labelLingerMs = 420 } = {}) {
  if (!start) return null;
  const orb = createSoulOrbElement(start);
  document.body.appendChild(orb);

  let label = null;
  if (typeof labelText === 'string' && labelText.trim().length > 0) {
    label = document.createElement('div');
    label.className = 'mana-soul-label';
    label.textContent = labelText;
    label.style.left = `${start.x}px`;
    label.style.top = `${start.y}px`;
    label.style.position = 'fixed';
    label.style.transform = 'translate(-50%, -50%) translateY(-18px) scale(0.8)';
    label.style.opacity = '0';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '81';
    document.body.appendChild(label);
  }

  const cleanup = () => {
    try { if (orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
    if (label) {
      try { if (label.parentNode) label.parentNode.removeChild(label); } catch {}
    }
  };

  const duration = Math.max(120, durationMs);
  const rise = Math.max(60, riseHeight);
  const drift = (Math.random() - 0.5) * 52;

  const tl = (typeof window !== 'undefined')
    ? window.gsap?.timeline?.({ onComplete: cleanup })
    : null;

  if (tl) {
    tl.addLabel('start', 0);
    const totalSeconds = duration / 1000;
    const ignite = 0.16;
    const ascent = Math.max(0.18, totalSeconds - ignite);
    const glide = Math.max(0.08, ascent * 0.45);
    const burst = Math.max(0.08, ascent - glide);
    const lingerSeconds = Math.max(0.12, (Number.isFinite(labelLingerMs) ? labelLingerMs : 420) / 1000);

    tl.to(orb, {
      duration: ignite,
      ease: 'power2.out',
      opacity: 1,
      scale: 0.9,
      filter: 'drop-shadow(0 0 18px rgba(96,165,250,0.95))',
    })
      .to(orb, {
        duration: glide,
        ease: 'power2.out',
        opacity: 0.92,
        scale: 1.08,
        y: -rise * 0.55,
        x: `+=${drift * 0.45}`,
        filter: 'drop-shadow(0 0 32px rgba(96,165,250,0.75))',
      }, '>-0.04')
      .to(orb, {
        duration: burst,
        ease: 'power4.in',
        opacity: 0,
        scale: 1.42,
        y: -rise,
        x: `+=${drift * 0.55}`,
        filter: 'drop-shadow(0 0 36px rgba(56,189,248,0.55))',
      }, `>-0.${Math.max(2, Math.round(burst * 10))}`);

    if (label) {
      tl.set(label, {
        opacity: 0,
        scale: 0.8,
        x: 0,
        y: -18,
      }, 0)
        .to(label, {
          opacity: 1,
          scale: 1,
          duration: ignite,
          ease: 'power2.out',
        }, 0)
        .to(label, {
          duration: glide + burst,
          ease: 'power1.out',
          x: `+=${drift * 0.6}`,
          y: -rise * 0.85,
        }, 'start+=0.08')
        .to(label, {
          opacity: 0,
          duration: Math.max(0.2, Math.min(0.5, lingerSeconds)),
          ease: 'power1.in',
        }, `>+${Math.max(0.12, lingerSeconds - (glide + burst))}`);
    }
  } else {
    orb.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
    requestAnimationFrame(() => {
      orb.style.opacity = '1';
      orb.style.transform = `translate(-50%, -50%) translate(${drift}px, -${rise}px) scale(1.25)`;
      if (label) {
        label.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-in-out`;
        label.style.opacity = '1';
        label.style.transform = `translate(-50%, -50%) translate(${drift * 0.6}px, -${rise * 0.85}px) scale(1)`;
        setTimeout(() => {
          label.style.opacity = '0';
        }, Math.max(120, duration - 160));
      }
      setTimeout(cleanup, duration + Math.max(200, Number.isFinite(labelLingerMs) ? labelLingerMs : 420));
    });
  }

  return orb;
}

// Эффект появления орба на панели с искрами
function playPanelOrbReveal(ownerIndex, slotIndex, { sparkCount = 12, visualOnly = true } = {}) {
  const bar = document.getElementById(`mana-display-${ownerIndex}`);
  if (!bar) {
    if (visualOnly && Number.isFinite(ownerIndex)) {
      releaseIncomingOrb(ownerIndex, slotIndex);
    }
    return;
  }

  const normalizedSlot = clampIndex(slotIndex);
  const fallbackIdx = (bar.children && bar.children.length > 0)
    ? Math.min(bar.children.length - 1, Math.max(0, bar.children.length - 1))
    : 0;
  const targetIdx = normalizedSlot != null ? normalizedSlot : fallbackIdx;

  const slot = bar.children[targetIdx];
  if (!slot) {
    if (visualOnly && Number.isFinite(ownerIndex)) {
      releaseIncomingOrb(ownerIndex, slotIndex);
    }
    return;
  }

  if (visualOnly && Number.isFinite(ownerIndex)) {
    releaseIncomingOrb(ownerIndex, slotIndex);
  }

  slot.className = 'mana-orb';
  slot.dataset.filled = '1';
  slot.dataset.pending = '0';
  slot.classList.remove('pending');

  slot.style.willChange = 'transform, opacity, box-shadow, filter';
  slot.style.transformOrigin = '50% 50%';
  slot.style.opacity = '0';
  slot.style.transform = 'scale(0.55)';

  const sparks = [];
  const cleanup = () => {
    slot.style.willChange = '';
    slot.style.transformOrigin = '';
    slot.style.opacity = '';
    slot.style.transform = '';
    slot.style.boxShadow = '';
    slot.style.filter = '';
    for (const spark of sparks) {
      try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
    }
  };

  const tl = (typeof window !== 'undefined')
    ? window.gsap?.timeline?.({ onComplete: cleanup })
    : null;
  if (tl) tl.addLabel('start', 0);

  const rect = slot.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < sparkCount; i += 1) {
    const spark = document.createElement('div');
    spark.className = 'mana-panel-spark';
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    document.body.appendChild(spark);
    sparks.push(spark);

    const angle = (Math.PI * 2 * (i / sparkCount)) + (Math.random() * 0.6);
    const distance = 36 + Math.random() * 42;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    if (tl) {
      tl.fromTo(spark, {
        opacity: 0,
        scale: 0.6,
        x: 0,
        y: 0,
      }, {
        opacity: 1,
        scale: 1.1,
        x: dx,
        y: dy,
        duration: 0.18,
        ease: 'power2.out',
      }, 'start')
        .to(spark, {
          opacity: 0,
          scale: 0.3,
          duration: 0.32,
          ease: 'power1.in',
        }, 'start+=0.18');
    } else {
      spark.style.transition = 'transform 360ms ease, opacity 360ms ease';
      requestAnimationFrame(() => {
        spark.style.opacity = '1';
        spark.style.transform = `translate(${dx}px, ${dy}px) scale(1)`;
        setTimeout(() => {
          spark.style.opacity = '0';
          spark.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        }, 180);
        setTimeout(() => {
          try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
        }, 360);
      });
    }
  }

  if (tl) {
    tl.to(slot, {
      duration: 0.18,
      ease: 'back.out(2.6)',
      opacity: 1,
      scale: 1.24,
      onStart: () => {
        slot.style.boxShadow = '0 0 24px rgba(96,165,250,0.85)';
        slot.style.filter = 'brightness(1.45)';
      },
    }, 'start')
      .to(slot, {
        duration: 0.28,
        ease: 'power2.inOut',
        scale: 1,
        filter: 'none',
        boxShadow: '0 0 12px rgba(30,160,255,0.85)',
      }, 'start+=0.18');
  } else {
    slot.style.transition = 'transform 280ms ease, opacity 200ms ease';
    requestAnimationFrame(() => {
      slot.style.opacity = '1';
      slot.style.transform = 'scale(1)';
      setTimeout(cleanup, 400);
    });
  }
}

export function renderBars(gameState) {
  if (!gameState) return;
  const total = 10;
  ensurePendingState();
  for (let p = 0; p < 2; p++) {
    const manaDisplay = document.getElementById(`mana-display-${p}`);
    if (!manaDisplay) continue;

    const slots = ensureManaSlots(manaDisplay, total);
    const anim = getAnim();
    const pendingAnim = (anim && anim.ownerIndex === p) ? anim : null;

    if (pendingAnim || getManaGainActive()) {
      continue;
    }

    const currentManaRaw = Number(gameState.players?.[p]?.mana ?? 0);
    const currentMana = Math.max(0, Math.floor(currentManaRaw));
    const beforeManaRaw = gameState.players?.[p]?._beforeMana;
    const beforeMana = Number.isFinite(beforeManaRaw) ? Math.max(0, Math.floor(beforeManaRaw)) : null;

    const pendingSlots = getPendingSlotSet(p);
    const explicitPending = pendingSlots instanceof Set ? pendingSlots.size : 0;
    const anonymousPendingRaw = getPendingAnonymous(p);
    const anonymousPending = Math.max(0, Math.floor(anonymousPendingRaw || 0));
    const pendingTotal = Math.max(0, Math.min(total, explicitPending + anonymousPending));

    let visibleFilledCount = Math.max(0, Math.min(total, currentMana - pendingTotal));
    if (beforeMana != null) {
      visibleFilledCount = Math.max(visibleFilledCount, Math.min(total, beforeMana));
    }

    const maxManaForPending = Math.max(currentMana, beforeMana != null ? beforeMana : 0);
    const totalManaSlots = Math.max(0, Math.min(total, maxManaForPending));
    let anonymousLeft = Math.max(0, Math.min(anonymousPending, Math.max(0, totalManaSlots - visibleFilledCount - explicitPending)));

    const prevFilledCount = slots.reduce((acc, el) => acc + (el.dataset?.filled === '1' ? 1 : 0), 0);

    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
    const activeSeat = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.active === 'number')
      ? window.gameState.active : (gameState?.active ?? null);
    const animateAllowed = (typeof mySeat === 'number')
      ? (mySeat === p)
      : (typeof activeSeat === 'number' ? activeSeat === p : true);
    const flightsActive = getActiveFlightCount(p) > 0;

    for (let i = 0; i < total; i += 1) {
      const slot = slots[i];
      if (!slot) continue;
      const wasFilled = slot.dataset.filled === '1';

      let isFilled = false;
      let isPending = false;

      if (i < visibleFilledCount) {
        isFilled = true;
      } else if (pendingSlots.has(i)) {
        isPending = true;
      } else if (anonymousLeft > 0 && i < totalManaSlots) {
        isPending = true;
        anonymousLeft -= 1;
      }

      slot.dataset.filled = isFilled ? '1' : '0';
      slot.dataset.pending = isPending ? '1' : '0';

      if (isFilled) {
        slot.className = 'mana-orb';
        slot.classList.remove('pending');
      } else {
        slot.className = 'mana-slot';
        if (isPending) slot.classList.add('pending');
        else slot.classList.remove('pending');
      }

      if (animateAllowed && isFilled && !wasFilled && !flightsActive) {
        slot.style.transition = 'none';
        slot.style.opacity = '0';
        slot.style.transform = 'translateX(16px) scale(0.6)';
        const delayMs = 60 * Math.max(0, i - prevFilledCount);
        setTimeout(() => {
          try {
            slot.style.transition = 'transform 220ms ease, opacity 220ms ease';
            requestAnimationFrame(() => {
              slot.style.opacity = '1';
              slot.style.transform = 'translateX(0) scale(1)';
            });
          } catch {}
        }, delayMs);
      } else if (!isFilled && wasFilled) {
        slot.style.transition = 'opacity 160ms ease';
        slot.style.opacity = '1';
        slot.style.transform = '';
      } else if (!isFilled) {
        slot.style.opacity = '1';
        slot.style.transform = '';
        slot.style.transition = '';
      }
    }
  }
}

export function animateManaGainFromWorld(pos, ownerIndex, visualOnly = true, targetSlotMaybe = null, optionsMaybe = {}) {
  try {
    let opts = (optionsMaybe && typeof optionsMaybe === 'object') ? optionsMaybe : {};
    let targetSlot = targetSlotMaybe;
    if (targetSlotMaybe && typeof targetSlotMaybe === 'object' && (!optionsMaybe || Object.keys(optionsMaybe).length === 0)) {
      opts = targetSlotMaybe;
      targetSlot = opts.targetSlot ?? null;
      if (opts.visualOnly != null) visualOnly = !!opts.visualOnly;
    }

    const totalAmount = Math.max(1, Math.floor(opts.count ?? 1));
    const startDelayMs = Math.max(0, Number.isFinite(opts.startDelayMs) ? Number(opts.startDelayMs) : 0);
    const flightDurationMs = Math.max(350, Number.isFinite(opts.flightDurationMs)
      ? Number(opts.flightDurationMs)
      : Math.round(Math.max(0.6, Number.isFinite(opts.flightDuration) ? Number(opts.flightDuration) : 0.7) * 1000));
    const riseHeight = Number.isFinite(opts.riseHeight) ? Number(opts.riseHeight) : 140;
    const reserveImmediately = !!opts.reserveImmediately;
    const slotSequence = Array.isArray(opts.slotSequence)
      ? opts.slotSequence.map(raw => {
        const num = Number(raw);
        if (!Number.isFinite(num)) return null;
        return Math.max(0, Math.min(9, Math.floor(num)));
      })
        .filter((value, idx, arr) => value != null && arr.indexOf(value) === idx)
      : null;
    const labelText = typeof opts.bundleLabel === 'string' ? opts.bundleLabel : `+${totalAmount}`;

    const gameState = (typeof window !== 'undefined') ? window.gameState : null;

    const determineSlots = () => {
      if (Array.isArray(slotSequence) && slotSequence.length >= totalAmount) {
        return slotSequence.slice(0, totalAmount);
      }

      const barEl = document.getElementById(`mana-display-${ownerIndex}`);
      const resolved = [];

      if (!visualOnly) {
        const currentMana = Math.max(0, (gameState?.players?.[ownerIndex]?.mana) || 0);
        const base = Math.max(0, Math.min(9, currentMana - 1));
        for (let i = 0; i < totalAmount; i += 1) {
          const idx = Math.max(0, Math.min(9, base - i));
          if (!resolved.includes(idx)) resolved.unshift(idx);
        }
        return resolved;
      }

      if (!barEl) {
        const fallback = Number.isFinite(targetSlot) ? Math.max(0, Math.min(9, targetSlot)) : 0;
        for (let i = 0; i < totalAmount; i += 1) {
          resolved.push(Math.max(0, Math.min(9, fallback + i)));
        }
        return resolved;
      }

      try {
        const filledNow = Array.from(barEl.children)
          .filter(el => el && el.classList && el.classList.contains('mana-orb')).length;
        const pendingSlots = Number.isFinite(ownerIndex) ? getPendingSlotSet(ownerIndex) : new Set();
        const reserved = new Set(Array.from(pendingSlots));
        let candidate = filledNow + reserved.size + (Number.isFinite(ownerIndex) ? getPendingAnonymous(ownerIndex) : 0);
        for (let i = 0; i < totalAmount; i += 1) {
          let nextIdx = Math.max(0, Math.min(9, candidate));
          while (reserved.has(nextIdx) && nextIdx < 9) {
            nextIdx += 1;
          }
          resolved.push(nextIdx);
          reserved.add(nextIdx);
          candidate = nextIdx + 1;
        }
      } catch {
        const fallback = Number.isFinite(targetSlot) ? Math.max(0, Math.min(9, targetSlot)) : 0;
        for (let i = 0; i < totalAmount; i += 1) {
          resolved.push(Math.max(0, Math.min(9, fallback + i)));
        }
      }

      return resolved;
    };

    let reserved = false;
    const reserveSlots = () => {
      if (!visualOnly || !Number.isFinite(ownerIndex) || reserved) return;
      reserved = true;
      try {
        const slots = determineSlots();
        if (!slots || !slots.length) {
          reserveIncomingOrbs(ownerIndex, [], totalAmount);
        } else {
          reserveIncomingOrbs(ownerIndex, slots, totalAmount);
        }
      } catch {
        reserveIncomingOrbs(ownerIndex, [], totalAmount);
      }
    };

    const scheduleReservation = (delayMs) => {
      if (!visualOnly || !Number.isFinite(ownerIndex)) return;
      if (reserveImmediately || delayMs <= 0) {
        reserveSlots();
      } else {
        const reserveLead = Math.max(0, delayMs - 90);
        setTimeout(reserveSlots, reserveLead);
      }
    };

    const finalizeFlight = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        if (visualOnly && Number.isFinite(ownerIndex)) {
          decrementActiveFlights(ownerIndex, 1);
        }
      };
    })();

    if (visualOnly && Number.isFinite(ownerIndex)) {
      incrementActiveFlights(ownerIndex, 1);
    }

    scheduleReservation(startDelayMs);

    const runEffect = () => {
      try {
        const source = pos && typeof pos.clone === 'function'
          ? pos.clone()
          : (pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
        if (!source) {
          if (visualOnly && Number.isFinite(ownerIndex)) {
            reserveSlots();
            const slots = determineSlots();
            (slots && slots.length ? slots : Array.from({ length: totalAmount })).forEach(slot => {
              releaseIncomingOrb(ownerIndex, slot);
            });
          }
          finalizeFlight();
          return;
        }
        const start = worldToScreen(source);
        if (!start) {
          if (visualOnly && Number.isFinite(ownerIndex)) {
            reserveSlots();
            const slots = determineSlots();
            (slots && slots.length ? slots : Array.from({ length: totalAmount })).forEach(slot => {
              releaseIncomingOrb(ownerIndex, slot);
            });
          }
          finalizeFlight();
          return;
        }

        reserveSlots();

        const slotsForReveal = determineSlots();

        playSoulOrbRiseEffect(start, {
          durationMs: flightDurationMs,
          riseHeight,
          labelText,
          labelLingerMs: Number.isFinite(opts.labelLingerMs) ? opts.labelLingerMs : 420,
        });

        setTimeout(() => {
          try {
            if (Array.isArray(slotsForReveal) && slotsForReveal.length) {
              for (const slot of slotsForReveal) {
                playPanelOrbReveal(ownerIndex, slot, { visualOnly });
              }
            } else {
              for (let i = 0; i < totalAmount; i += 1) {
                playPanelOrbReveal(ownerIndex, null, { visualOnly });
              }
            }
          } catch (err) {
            console.error('[mana] Ошибка появления орба на панели:', err);
            if (visualOnly && Number.isFinite(ownerIndex)) {
              const toRelease = Array.isArray(slotsForReveal) && slotsForReveal.length
                ? slotsForReveal
                : new Array(totalAmount).fill(null);
              for (const slot of toRelease) {
                releaseIncomingOrb(ownerIndex, slot);
              }
            }
          } finally {
            finalizeFlight();
          }
        }, flightDurationMs);
      } catch (err) {
        console.error('[mana] Ошибка анимации орба маны:', err);
        if (visualOnly && Number.isFinite(ownerIndex)) {
          reserveSlots();
          const slots = determineSlots();
          const toRelease = Array.isArray(slots) && slots.length
            ? slots
            : new Array(totalAmount).fill(null);
          for (const slot of toRelease) {
            releaseIncomingOrb(ownerIndex, slot);
          }
        }
        finalizeFlight();
      }
    };

    if (startDelayMs > 0) setTimeout(runEffect, startDelayMs);
    else runEffect();
  } catch (err) {
    console.error('[mana] animateManaGainFromWorld error:', err);
  }
}

export function animateTurnManaGain(ownerIndex, beforeMana, afterMana, durationMs = 900) {
  return new Promise(resolve => {
    try {
      // Проверяем, не идет ли уже анимация
      if (getManaGainActive()) {
        console.warn('Mana animation already in progress, skipping');
        resolve();
        return;
      }
      
      console.log(`[MANA] Starting animation for player ${ownerIndex}: ${beforeMana} -> ${afterMana}`);
      
      // Устанавливаем флаги активности и синхронизируем с legacy
      setManaGainActive(true);
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
      
      // Готовим панель: блокируем раннее появление новых орбов и пересобираем UI
      const startIdx = Math.max(0, Math.min(9, beforeMana));
      const endIdx = Math.max(-1, Math.min(9, afterMana - 1));
      setAnim({ ownerIndex, startIdx, endIdx });
      try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      
      const bar = document.getElementById(`mana-display-${ownerIndex}`);
      if (!bar) {
        console.warn(`[MANA] Mana display not found for player ${ownerIndex}`);
        setManaGainActive(false);
        try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
        resolve();
        return;
      }
      
      const indices = [];
      for (let i = startIdx; i <= endIdx; i++) indices.push(i);
      const sparks = [];
      
      const cleanup = () => {
        console.log(`[MANA] Cleaning up animation for player ${ownerIndex}`);
        // Убираем все блестки
        for (const s of sparks) { 
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch {} 
        }
        // Сбрасываем флаги и состояние
        setManaGainActive(false);
        try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
        setAnim(null);
        
        // Очищаем _beforeMana после завершения анимации
        try {
          if (typeof window !== 'undefined' && window.gameState && window.gameState.players && window.gameState.players[ownerIndex]) {
            delete window.gameState.players[ownerIndex]._beforeMana;
          }
        } catch {}
        
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
        resolve();
      };
      
      // Если нет новых орбов - просто вспышка на панели
      if (indices.length === 0) {
        const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
        if (tl) {
          tl.to(bar, { filter: 'brightness(2.1) drop-shadow(0 0 16px rgba(96,165,250,0.95))', duration: 0.154, ease: 'power2.out' })
            .to(bar, { filter: 'none', duration: 0.42, ease: 'power2.inOut' })
            .to({}, { duration: Math.max(0, (durationMs/1000) - 0.574) });
        } else {
          setTimeout(cleanup, durationMs);
        }
        return;
      }
      
      // Красивая анимация с вспышками и блестками для каждого нового орба
      const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
      if (!tl) {
        setTimeout(cleanup, durationMs);
        return;
      }
      
      const perOrbDelay = 0.12;
      for (const idx of indices) {
        const el = bar.children[idx];
        if (!el) continue;

        // Подготавливаем элемент для анимации
        el.style.willChange = 'transform, box-shadow, filter, opacity';
        el.style.transformOrigin = '50% 50%';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.6)';

        const revealAt = Math.max(0, (idx - startIdx) * perOrbDelay);
        if (idx === startIdx) {
          tl.to(bar, {
            filter: 'brightness(2.05) drop-shadow(0 0 18px rgba(96,165,250,0.95))',
            duration: 0.18,
            ease: 'power2.out'
          }, revealAt)
            .to(bar, {
              filter: 'none',
              duration: 0.32,
              ease: 'power2.inOut'
            }, revealAt + 0.18);
        }

        // На старте убеждаемся что элемент существует как пустая ячейка, затем превращаем в орб + вспышка
        tl.call(() => {
          try {
            if (el.className !== 'mana-orb') {
              el.className = 'mana-orb';
              el.style.opacity = '0';
            }
          } catch {}
        }, null, revealAt)
          // Анимация масштабирования и свечения орба
          .to(el, {
            duration: 0.196,
            ease: 'back.out(2.2)',
            onStart: () => {
              el.style.boxShadow = '0 0 22px rgba(96,165,250,0.95), 0 0 44px rgba(56,189,248,0.85)';
              el.style.opacity = '1';
            },
            onComplete: () => {
              el.style.boxShadow = '0 0 12px rgba(30,160,255,0.85)';
            }
          }, revealAt)
          .to(el, { scale: 2.5, duration: 0.196, ease: 'back.out(2.2)' }, revealAt)
          .to(el, { scale: 1.0, duration: 0.42, ease: 'power2.inOut' }, revealAt + 0.196);

        // Создаем блестки вокруг каждого орба
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const sparkCount = 16; // 16 блесток на каждый орб
        
        for (let i = 0; i < sparkCount; i++) {
          const spark = document.createElement('div');
          spark.style.position = 'fixed';
          spark.style.left = `${centerX}px`;
          spark.style.top = `${centerY}px`;
          spark.style.width = '4px'; 
          spark.style.height = '4px';
          spark.style.borderRadius = '50%';
          spark.style.pointerEvents = 'none';
          spark.style.background = 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(125,211,252,1) 60%, rgba(14,165,233,0.8) 100%)';
          spark.style.boxShadow = '0 0 10px rgba(59,130,246,0.95)';
          spark.style.opacity = '0';
          spark.style.zIndex = '70';
          document.body.appendChild(spark);
          sparks.push(spark);
          
          // Случайный угол и расстояние для блестки
          const angle = (Math.PI * 2) * (i / sparkCount) + Math.random() * 0.8;
          const dist = 40 + Math.random() * 40;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          const t0 = revealAt + 0.04;

          // Анимация блестки: появление -> разлет -> исчезновение
          tl.fromTo(spark,
            { x: 0, y: 0, opacity: 0, scale: 0.6 },
            { x: dx, y: dy, opacity: 1, scale: 1.2, duration: 0.154, ease: 'power2.out' },
            t0)
            .to(spark, { 
              opacity: 0, 
              scale: 0.3, 
              duration: 0.35, 
              ease: 'power1.in', 
              delay: 0.105 
            }, `>-0.1`);
        }
      }
      
      // Добавляем паузу если анимация короче требуемой длительности
      tl.to({}, { duration: Math.max(0, (durationMs/1000) - tl.duration()) });
      
    } catch (e) {
      console.error('Error in animateTurnManaGain:', e);
      setManaGainActive(false);
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
      resolve();
    }
  });
}

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain, resetPendingState };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;



