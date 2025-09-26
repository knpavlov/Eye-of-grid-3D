// Mana bar rendering and animations
import { worldToScreen } from '../scene/index.js';

const FALLBACK_PENDING_STATE = {
  counts: [0, 0],
  slots: [new Set(), new Set()],
  anonymous: [0, 0],
};

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

    const currentMana = Math.max(0, Number(gameState.players?.[p]?.mana ?? 0));
    const beforeMana = gameState.players?.[p]?._beforeMana;
    let displayMana = currentMana;
    if (getManaGainActive() && typeof beforeMana === 'number' && beforeMana < currentMana) {
      displayMana = beforeMana;
    }

    const pendingSlots = getPendingSlotSet(p);
    const anonymousPending = getPendingAnonymous(p);
    const block = Math.max(0, Math.min(total, Number(getBlocks()?.[p]) || 0));
    const effectiveFilledCount = Math.max(0, Math.min(total, Math.floor(displayMana - block)));
    const prevFilledCount = slots.reduce((acc, el) => acc + (el.dataset?.filled === '1' ? 1 : 0), 0);

    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
    const activeSeat = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.active === 'number')
      ? window.gameState.active : (gameState?.active ?? null);
    const animateAllowed = (typeof mySeat === 'number')
      ? (mySeat === p)
      : (typeof activeSeat === 'number' ? activeSeat === p : true);

    let anonymousLeft = Math.max(0, Math.floor(anonymousPending));
    for (let i = 0; i < total; i += 1) {
      const slot = slots[i];
      if (!slot) continue;
      const wasFilled = slot.dataset.filled === '1';

      let isFilled = false;
      let isPending = false;

      if (i < effectiveFilledCount) {
        isFilled = true;
      } else if (pendingSlots.has(i)) {
        isPending = true;
      } else if (anonymousLeft > 0 && i < displayMana) {
        isPending = true;
        anonymousLeft -= 1;
      } else if (i < displayMana) {
        isFilled = true;
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

      if (animateAllowed && isFilled && !wasFilled) {
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

    const count = Math.max(1, Math.floor(opts.count ?? 1));
    const startDelayMs = Math.max(0, Number.isFinite(opts.startDelayMs) ? Number(opts.startDelayMs) : 0);
    const delayBetweenMs = Math.max(0, Number.isFinite(opts.delayBetweenMs) ? Number(opts.delayBetweenMs) : 210);
    const flightDuration = Math.max(0.45, Number.isFinite(opts.flightDuration) ? Number(opts.flightDuration) : 1.05);
    const flightEase = typeof opts.flightEase === 'string' ? opts.flightEase : 'power4.in';
    const arrivalScale = Number.isFinite(opts.arrivalScale) ? Number(opts.arrivalScale) : 1.1;
    const reserveImmediately = !!opts.reserveImmediately;

    const gameState = (typeof window !== 'undefined') ? window.gameState : null;

    if (visualOnly && reserveImmediately && Number.isFinite(ownerIndex)) {
      const slotsToReserve = [];
      if (typeof targetSlot === 'number') {
        for (let i = 0; i < count; i += 1) {
          const normalized = clampIndex(targetSlot + i);
          if (normalized != null) slotsToReserve.push(normalized);
        }
      }
      reserveIncomingOrbs(ownerIndex, slotsToReserve, count);
    }

    const scheduleSingle = (slotIndex, extraDelayMs) => {
      const normalizedSlot = clampIndex(slotIndex);
      let resolvedSlot = normalizedSlot;
      setTimeout(() => {
        try {
          const source = pos && typeof pos.clone === 'function'
            ? pos.clone()
            : (pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
          if (!source) return;
          const start = worldToScreen(source);
          const barEl = document.getElementById(`mana-display-${ownerIndex}`);
          if (!barEl) return;

          const barRect = barEl.getBoundingClientRect();
          let currentMana = Math.max(0, (gameState?.players?.[ownerIndex]?.mana) || 0);
          const currentBlocks = Math.max(0, Number(getBlocks()?.[ownerIndex]) || 0);

          let targetIdx;
          if (normalizedSlot != null) {
            targetIdx = normalizedSlot;
          } else if (visualOnly) {
            try {
              const filledNow = Array.from(barEl.children)
                .filter(el => el && el.classList && el.classList.contains('mana-orb')).length;
              targetIdx = Math.min(9, Math.max(0, filledNow));
            } catch {
              const visibleMana = Math.max(0, currentMana - currentBlocks);
              targetIdx = Math.min(9, visibleMana);
            }
          } else {
            targetIdx = Math.max(0, Math.min(9, currentMana - 1));
          }

          resolvedSlot = clampIndex(targetIdx);

          if (visualOnly && Number.isFinite(ownerIndex) && !reserveImmediately) {
            reserveIncomingOrbs(ownerIndex, resolvedSlot != null ? [resolvedSlot] : [], 1);
          }

          let child = barEl.children && barEl.children[targetIdx];
          if (!child && barEl.children && barEl.children.length > 0) {
            const lastIdx = Math.min(targetIdx, barEl.children.length - 1);
            child = barEl.children[lastIdx];
          }

          let tx;
          let ty;
          if (child) {
            const srect = child.getBoundingClientRect();
            tx = srect.left + srect.width / 2;
            ty = srect.top + srect.height / 2;
          } else {
            tx = barRect.left + barRect.width / 2;
            ty = barRect.top + barRect.height / 2;
          }

          const orb = document.createElement('div');
          orb.className = 'mana-orb';
          orb.style.position = 'fixed';
          orb.style.left = `${start.x}px`;
          orb.style.top = `${start.y}px`;
          orb.style.transform = 'translate(-50%, -50%) scale(0.35)';
          orb.style.opacity = '0';
          orb.style.zIndex = '60';
          document.body.appendChild(orb);

          const cleanup = () => {
            try { if (orb && orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
            if (visualOnly && Number.isFinite(ownerIndex)) {
              releaseIncomingOrb(ownerIndex, resolvedSlot);
            }
          };

          const tl = (typeof window !== 'undefined')
            ? window.gsap?.timeline?.({ onComplete: cleanup })
            : null;
          if (tl) {
            tl.to(orb, {
              duration: 0.22,
              ease: 'back.out(1.6)',
              opacity: 1,
              transform: 'translate(-50%, -50%) scale(1)'
            })
              .to(orb, {
                duration: flightDuration,
                ease: flightEase,
                left: tx,
                top: ty
              }, '>-0.06')
              .to(orb, {
                duration: 0.16,
                ease: 'power1.out',
                transform: `translate(-50%, -50%) scale(${arrivalScale})`
              }, `>-0.08`)
              .to(orb, {
                duration: 0.16,
                ease: 'power1.inOut',
                transform: 'translate(-50%, -50%) scale(1)'
              });
          } else {
            setTimeout(cleanup, Math.max(600, (flightDuration * 1000) + 200));
          }
        } catch (err) {
          console.error('[mana] Ошибка анимации орба маны:', err);
          if (visualOnly && Number.isFinite(ownerIndex)) {
            releaseIncomingOrb(ownerIndex, resolvedSlot);
          }
        }
      }, extraDelayMs);
    };

    for (let i = 0; i < count; i += 1) {
      const slotIndex = (typeof targetSlot === 'number') ? (targetSlot + i) : null;
      const extraDelayMs = startDelayMs + delayBetweenMs * i;
      scheduleSingle(slotIndex, extraDelayMs);
    }
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



