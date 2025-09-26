// Mana bar rendering and animations
import { worldToScreen } from '../scene/index.js';

// Keep compatibility with legacy globals
function getBlocks(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_BLOCK) || [0,0]; } catch { return [0,0]; } }
function setBlocks(v){ try { window.PENDING_MANA_BLOCK = v; } catch {} }
function getAnim(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_ANIM) || null; } catch { return null; } }
function setAnim(v){ try { window.PENDING_MANA_ANIM = v; } catch {} }

// Sync with legacy flags
function getManaGainActive(){ try { return !!(typeof window !== 'undefined' && window.manaGainActive); } catch { return false; } }
function setManaGainActive(v){ try { if (typeof window !== 'undefined') { window.manaGainActive = !!v; } } catch {} }

function safeUpdateUI() {
  try {
    if (typeof window !== 'undefined' && typeof window.updateUI === 'function') {
      window.updateUI();
    }
  } catch {}
}

const manaAnimationQueue = [];
let manaAnimationRunning = false;

function normalizeAnimationOptions(durationOrOptions) {
  if (durationOrOptions && typeof durationOrOptions === 'object') {
    const durationMsRaw = durationOrOptions.durationMs ?? durationOrOptions.duration ?? durationOrOptions.time;
    const durationMs = Number.isFinite(durationMsRaw) ? Number(durationMsRaw) : 900;
    return {
      durationMs,
      simultaneousReveal: !!durationOrOptions.simultaneousReveal,
      skipIfNoChange: !!durationOrOptions.skipIfNoChange,
    };
  }
  const numeric = Number(durationOrOptions);
  return {
    durationMs: Number.isFinite(numeric) && numeric > 0 ? numeric : 900,
    simultaneousReveal: false,
    skipIfNoChange: false,
  };
}

function enqueueManaAnimation(request) {
  return new Promise(resolve => {
    manaAnimationQueue.push({ ...request, resolve });
    processManaAnimationQueue();
  });
}

function processManaAnimationQueue() {
  if (manaAnimationRunning) return;
  const next = manaAnimationQueue.shift();
  if (!next) return;
  manaAnimationRunning = true;
  startManaAnimation(next).catch(err => {
    console.error('[mana] Ошибка анимации маны:', err);
  }).finally(() => {
    manaAnimationRunning = false;
    try { next.resolve(); } catch {}
    processManaAnimationQueue();
  });
}

function triggerPanelReveal(ownerIndex, amount, options = {}) {
  if (!Number.isFinite(ownerIndex) || amount <= 0) return;
  const w = typeof window !== 'undefined' ? window : null;
  if (!w) return;
  try {
    const state = w.gameState;
    const player = state?.players?.[ownerIndex];
    if (!player) {
      safeUpdateUI();
      return;
    }
    const current = Math.max(0, Number(player.mana) || 0);
    const pendingBefore = Number.isFinite(player._pendingManaReveal) ? Number(player._pendingManaReveal) : 0;
    const pendingTotal = Math.max(0, pendingBefore + amount);
    const base = Math.max(0, current - pendingTotal);
    player._pendingManaReveal = pendingTotal;
    player._beforeMana = base;
    const target = Math.max(base, Math.min(current, base + amount));
    const durationMs = Number.isFinite(options.durationMs) ? Number(options.durationMs) : 780;
    animateTurnManaGain(ownerIndex, base, target, {
      durationMs,
      simultaneousReveal: true,
      skipIfNoChange: true,
    }).catch(err => {
      console.error('[mana] Ошибка при запуске анимации панели маны:', err);
      safeUpdateUI();
    });
  } catch (err) {
    console.error('[mana] Не удалось подготовить панель маны:', err);
    safeUpdateUI();
  }
}

export function renderBars(gameState) {
  if (!gameState) return;
  const total = 10;
  for (let p = 0; p < 2; p++) {
    const manaDisplay = document.getElementById(`mana-display-${p}`);
    if (!manaDisplay) continue;
    const prev = manaDisplay.querySelectorAll('.mana-orb').length;
    const currentMana = gameState.players?.[p]?.mana ?? 0;
    const beforeMana = gameState.players?.[p]?._beforeMana;
    const anim = getAnim();
    
    // Apply pending animation window for both clients so +2 doesn't pop in early
    const pending = (anim && anim.ownerIndex === p) ? anim : null;
    const block = Math.max(0, Number(getBlocks()?.[p]) || 0);
    
    // If this bar is scheduled or currently animating, avoid rebuilding to prevent flicker
    if (pending || getManaGainActive()) {
      continue;
    }
    
    // Используем _beforeMana только во время анимации прироста хода
    let displayMana = currentMana;
    if (getManaGainActive() && typeof beforeMana === 'number' && beforeMana < currentMana) {
      displayMana = beforeMana; // Показываем старое значение во время анимации
    }
    
    const blockAdjusted = Math.max(0, displayMana - Math.min(block, displayMana));
    const renderManaBase = pending ? Math.min(blockAdjusted, Math.max(0, pending.startIdx)) : blockAdjusted;
    const renderMana = Math.max(0, Math.min(total, renderManaBase));
    
    // Сохраняем текущие видимые орбы, чтобы избежать мерцания
    const existingOrbs = Array.from(manaDisplay.querySelectorAll('.mana-orb, .mana-slot'));
    
    manaDisplay.innerHTML = '';
    const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
    const activeSeat = (typeof window !== 'undefined' && window.gameState && typeof window.gameState.active === 'number')
      ? window.gameState.active : (gameState?.active ?? null);
    const animateAllowed = (typeof mySeat === 'number') ? (mySeat === p) : (typeof activeSeat === 'number' ? activeSeat === p : true);
    for (let i = 0; i < total; i++) {
      const orb = document.createElement('div');
      const filled = i < renderMana;
      const isBlockedForAnim = !!(pending && i >= pending.startIdx && i <= pending.endIdx);
      orb.className = filled ? 'mana-orb' : 'mana-slot';
      
      // Избегаем мерцания: если орб уже был видим, начинаем с opacity: 1
      const wasVisible = existingOrbs[i] && existingOrbs[i].classList.contains('mana-orb');
      orb.style.opacity = (!animateAllowed) ? '1' : ((filled && wasVisible) ? '1' : (filled ? '0' : '1'));
      
      manaDisplay.appendChild(orb);
      if (animateAllowed && filled && !isBlockedForAnim && !wasVisible) {
        const delay = 0.06 * Math.max(0, i - prev);
        setTimeout(()=>{
          try {
            orb.style.transform = 'translateX(16px) scale(0.6)';
            orb.style.transition = 'transform 220ms ease, opacity 220ms ease';
            requestAnimationFrame(()=>{
              orb.style.opacity = '1';
              orb.style.transform = 'translateX(0) scale(1)';
            });
          } catch {}
        }, delay*1000);
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
    // targetSlot сохраняем для обратной совместимости, но в новой анимации не используется
    void targetSlot;

    const amount = Math.max(1, Math.floor(opts.count ?? 1));
    const startDelayMs = Math.max(0, Number.isFinite(opts.startDelayMs) ? Number(opts.startDelayMs) : 0);
    const riseDurationMs = Math.max(300, Number.isFinite(opts.riseDurationMs) ? Number(opts.riseDurationMs) : 1000);
    const fadeDurationMs = Math.max(120, Number.isFinite(opts.fadeDurationMs) ? Number(opts.fadeDurationMs) : 260);
    const labelHoldMs = Math.max(160, Number.isFinite(opts.labelHoldMs) ? Number(opts.labelHoldMs) : 420);
    const riseHeight = Number.isFinite(opts.riseHeight) ? Number(opts.riseHeight) : 140;
    const labelOffsetX = Number.isFinite(opts.labelOffsetX) ? Number(opts.labelOffsetX) : 46;
    const labelOffsetY = Number.isFinite(opts.labelOffsetY) ? Number(opts.labelOffsetY) : -4;
    const flashScale = Number.isFinite(opts.flashScale) ? Number(opts.flashScale) : 2.8;
    const flashDurationMs = Math.max(120, Number.isFinite(opts.flashDurationMs) ? Number(opts.flashDurationMs) : 220);
    const panelDurationMs = Number.isFinite(opts.panelDurationMs) ? Number(opts.panelDurationMs) : null;

    const source = pos && typeof pos.clone === 'function'
      ? pos.clone()
      : (pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
    const screenPos = source ? worldToScreen(source) : null;
    const hasVisual = !!(screenPos && typeof document !== 'undefined' && document.body);
    const ownerValid = Number.isFinite(ownerIndex);
    const shouldBlock = visualOnly && ownerValid && amount > 0;

    const totalWaitMs = startDelayMs + riseDurationMs + labelHoldMs + fadeDurationMs + 80;

    const releaseBlock = () => {
      if (!shouldBlock) return;
      try {
        const b = getBlocks();
        b[ownerIndex] = Math.max(0, (b[ownerIndex] || 0) - amount);
        setBlocks(b);
      } catch {}
      safeUpdateUI();
    };

    const finalize = () => {
      releaseBlock();
      triggerPanelReveal(ownerIndex, amount, { durationMs: panelDurationMs ?? undefined });
    };

    if (shouldBlock) {
      try {
        const blocks = getBlocks();
        blocks[ownerIndex] = Math.max(0, (blocks[ownerIndex] || 0) + amount);
        setBlocks(blocks);
      } catch {}
      safeUpdateUI();
    }

    if (!hasVisual) {
      setTimeout(finalize, totalWaitMs);
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = `${screenPos.x}px`;
    root.style.top = `${screenPos.y}px`;
    root.style.transform = 'translate(-50%, -50%)';
    root.style.pointerEvents = 'none';
    root.style.zIndex = String(Number.isFinite(opts.zIndex) ? opts.zIndex : 72);
    root.style.width = '0';
    root.style.height = '0';

    const orb = document.createElement('div');
    orb.style.position = 'absolute';
    orb.style.left = '50%';
    orb.style.top = '50%';
    orb.style.width = '38px';
    orb.style.height = '38px';
    orb.style.borderRadius = '50%';
    orb.style.background = 'radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(125,211,252,0.95) 52%, rgba(14,165,233,0.55) 100%)';
    orb.style.boxShadow = '0 0 18px rgba(59,130,246,0.85), 0 0 36px rgba(56,189,248,0.45)';
    orb.style.opacity = '0';
    orb.style.transform = 'translate(-50%, -50%) scale(0.6)';
    orb.style.filter = 'drop-shadow(0 0 6px rgba(56,189,248,0.8))';

    const label = document.createElement('div');
    label.textContent = `+${amount}`;
    label.style.position = 'absolute';
    label.style.left = '50%';
    label.style.top = '50%';
    label.style.transform = `translate(${labelOffsetX}px, ${labelOffsetY}px)`;
    label.style.color = '#e0f2fe';
    label.style.fontWeight = '700';
    label.style.fontSize = '22px';
    label.style.fontFamily = 'inherit';
    label.style.letterSpacing = '0.02em';
    label.style.textShadow = '0 0 8px rgba(59,130,246,0.8), 0 0 16px rgba(14,165,233,0.45)';
    label.style.opacity = '0';
    label.style.pointerEvents = 'none';
    label.style.whiteSpace = 'nowrap';

    root.appendChild(orb);
    root.appendChild(label);
    document.body.appendChild(root);

    let disposed = false;
    let flashEl = null;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch {}
      try { if (flashEl && flashEl.parentNode) flashEl.parentNode.removeChild(flashEl); } catch {}
      flashEl = null;
      finalize();
    };

    const spawnFlash = () => {
      try {
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.left = `${screenPos.x}px`;
        flash.style.top = `${screenPos.y - riseHeight}px`;
        flash.style.transform = 'translate(-50%, -50%) scale(0.45)';
        flash.style.width = '56px';
        flash.style.height = '56px';
        flash.style.borderRadius = '50%';
        flash.style.pointerEvents = 'none';
        flash.style.background = 'radial-gradient(circle, rgba(224,242,254,0.95) 0%, rgba(125,211,252,0.6) 55%, rgba(14,165,233,0.2) 100%)';
        flash.style.boxShadow = '0 0 22px rgba(14,165,233,0.55)';
        document.body.appendChild(flash);
        flashEl = flash;
        const tlFlash = (typeof window !== 'undefined') ? window.gsap?.timeline?.({
          onComplete: () => {
            try { if (flash.parentNode) flash.parentNode.removeChild(flash); } catch {}
            if (flashEl === flash) flashEl = null;
          }
        }) : null;
        if (tlFlash) {
          tlFlash.to(flash, { duration: flashDurationMs / 1000, opacity: 0, scale: flashScale, ease: 'power2.out' });
        } else {
          setTimeout(() => {
            try { if (flash.parentNode) flash.parentNode.removeChild(flash); } catch {}
            if (flashEl === flash) flashEl = null;
          }, flashDurationMs);
        }
      } catch {}
    };

    const runTimeline = () => {
      const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
      if (!tl) {
        runFallback();
        return;
      }
      const riseSeconds = riseDurationMs / 1000;
      const fadeSeconds = fadeDurationMs / 1000;
      const labelLift = -Math.max(24, riseHeight * 0.42);
      tl.to(orb, {
        duration: 0.22,
        ease: 'back.out(2.1)',
        opacity: 1,
        scale: 1,
      })
        .fromTo(label, {
          opacity: 0,
          scale: 0.88,
        }, {
          opacity: 1,
          scale: 1,
          duration: 0.24,
          ease: 'power2.out',
        }, '<0.04')
        .to(root, {
          y: -riseHeight,
          duration: riseSeconds,
          ease: 'power1.out',
        }, '<0.02')
        .to(label, {
          y: labelLift,
          duration: (riseDurationMs + labelHoldMs) / 1000,
          ease: 'power1.out',
        }, '<')
        .to(orb, {
          opacity: 0,
          scale: 0.4,
          duration: fadeSeconds,
          ease: 'power1.in',
        }, `>-${Math.min(0.18, fadeSeconds)}`)
        .to(label, {
          opacity: 0,
          duration: 0.32,
          ease: 'power1.in',
        }, `>-${Math.min(0.24, fadeSeconds)}`)
        .add(() => spawnFlash(), `>-${Math.min(0.20, fadeSeconds + 0.02)}`);
    };

    const runFallback = () => {
      try {
        const labelLift = -Math.max(24, riseHeight * 0.42);
        root.style.transition = `transform ${riseDurationMs}ms ease-out`;
        orb.style.transition = `opacity ${fadeDurationMs}ms ease-in, transform 220ms ease-out`;
        label.style.transition = `opacity 260ms ease-in ${labelHoldMs}ms, transform ${riseDurationMs + labelHoldMs}ms ease-out`;
        orb.style.opacity = '1';
        label.style.opacity = '1';
        requestAnimationFrame(() => {
          try {
            orb.style.transform = 'translate(-50%, -50%) scale(1)';
            label.style.transform = `translate(${labelOffsetX}px, ${labelOffsetY + labelLift}px)`;
            root.style.transform = `translate(-50%, -50%) translateY(${-riseHeight}px)`;
          } catch {}
        });
        setTimeout(() => {
          try { orb.style.opacity = '0'; } catch {}
        }, Math.max(0, riseDurationMs - 80));
        setTimeout(() => {
          try { label.style.opacity = '0'; } catch {}
        }, riseDurationMs + labelHoldMs);
      } catch {}
      setTimeout(cleanup, totalWaitMs);
    };

    setTimeout(() => {
      try {
        runTimeline();
      } catch (err) {
        console.error('[mana] Ошибка запуска анимации маны:', err);
        runFallback();
      }
    }, startDelayMs);
  } catch (err) {
    console.error('[mana] animateManaGainFromWorld error:', err);
  }
}

function startManaAnimation({ ownerIndex, beforeMana, afterMana, options }) {
  return new Promise(resolve => {
    try {
      const before = Math.max(0, Math.floor(Number(beforeMana) || 0));
      const after = Math.max(0, Math.floor(Number(afterMana) || 0));
      const durationMs = Number.isFinite(options?.durationMs) ? options.durationMs : 900;
      if (options?.skipIfNoChange && after <= before) {
        resolve();
        return;
      }

      console.log(`[MANA] Starting animation for player ${ownerIndex}: ${before} -> ${after}`);

      setManaGainActive(true);
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}

      const startIdx = Math.max(0, Math.min(9, before));
      const endIdx = Math.max(-1, Math.min(9, after - 1));
      setAnim({ ownerIndex, startIdx, endIdx });
      safeUpdateUI();

      const bar = document.getElementById(`mana-display-${ownerIndex}`);
      if (!bar) {
        console.warn(`[MANA] Mana display not found for player ${ownerIndex}`);
        setManaGainActive(false);
        try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
        setAnim(null);
        resolve();
        return;
      }

      const indices = [];
      for (let i = startIdx; i <= endIdx; i += 1) indices.push(i);
      const sparks = [];

      const cleanup = () => {
        for (const s of sparks) {
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch {}
        }
        setManaGainActive(false);
        try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
        setAnim(null);
        try {
          if (typeof window !== 'undefined' && window.gameState && window.gameState.players && window.gameState.players[ownerIndex]) {
            const player = window.gameState.players[ownerIndex];
            const delta = Math.max(0, after - before);
            const pending = Number.isFinite(player._pendingManaReveal) ? Number(player._pendingManaReveal) : 0;
            const remaining = Math.max(0, pending - delta);
            if (remaining > 0) {
              player._pendingManaReveal = remaining;
              player._beforeMana = Math.max(0, before + delta);
            } else {
              delete player._pendingManaReveal;
              delete player._beforeMana;
            }
          }
        } catch {}
        safeUpdateUI();
        resolve();
      };

      if (indices.length === 0) {
        const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
        if (tl) {
          tl.to(bar, { filter: 'brightness(2.1) drop-shadow(0 0 16px rgba(96,165,250,0.95))', duration: 0.154, ease: 'power2.out' })
            .to(bar, { filter: 'none', duration: 0.42, ease: 'power2.inOut' })
            .to({}, { duration: Math.max(0, (durationMs / 1000) - 0.574) });
        } else {
          setTimeout(cleanup, durationMs);
        }
        return;
      }

      const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
      if (!tl) {
        setTimeout(cleanup, durationMs);
        return;
      }

      const perOrbDelay = options?.simultaneousReveal ? 0 : 0.12;
      for (const idx of indices) {
        const el = bar.children[idx];
        if (!el) continue;

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

        tl.call(() => {
          try {
            if (el.className !== 'mana-orb') {
              el.className = 'mana-orb';
              el.style.opacity = '0';
            }
          } catch {}
        }, null, revealAt)
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

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const sparkCount = 16;

        for (let i = 0; i < sparkCount; i += 1) {
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

          const angle = (Math.PI * 2) * (i / sparkCount) + Math.random() * 0.8;
          const dist = 40 + Math.random() * 40;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          const t0 = revealAt + 0.04;

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

      tl.to({}, { duration: Math.max(0, (durationMs / 1000) - tl.duration()) });
    } catch (e) {
      console.error('Error in animateTurnManaGain:', e);
      setManaGainActive(false);
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
      setAnim(null);
      try {
        if (typeof window !== 'undefined' && window.gameState && window.gameState.players && window.gameState.players[ownerIndex]) {
          const player = window.gameState.players[ownerIndex];
          delete player._pendingManaReveal;
          delete player._beforeMana;
        }
      } catch {}
      safeUpdateUI();
      resolve();
    }
  });
}

export function animateTurnManaGain(ownerIndex, beforeMana, afterMana, durationOrOptions = 900) {
  const options = normalizeAnimationOptions(durationOrOptions);
  return enqueueManaAnimation({ ownerIndex, beforeMana, afterMana, options });
}

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;



