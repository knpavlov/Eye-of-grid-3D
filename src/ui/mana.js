// Mana bar rendering and animations
import { worldToScreen } from '../scene/index.js';

// Keep compatibility with legacy globals
function getBlocks(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_BLOCK) || [0,0]; } catch { return [0,0]; } }
function setBlocks(v){ try { window.PENDING_MANA_BLOCK = v; } catch {} }
function getAnim(){ try { return (typeof window !== 'undefined' && window.PENDING_MANA_ANIM) || null; } catch { return null; } }

// Флаг активности раскрытия орбов, чтобы не перерисовывать панель во время анимации
function getRevealActiveFlags(){
  try {
    if (typeof window === 'undefined') return [false, false];
    if (!Array.isArray(window.__MANA_REVEAL_ACTIVE)) {
      window.__MANA_REVEAL_ACTIVE = [false, false];
    }
    const flags = window.__MANA_REVEAL_ACTIVE;
    if (flags.length < 2) {
      flags[0] = !!flags[0];
      flags[1] = !!flags[1];
    }
    return flags;
  } catch {
    return [false, false];
  }
}

function isRevealActive(ownerIndex){
  try {
    const flags = getRevealActiveFlags();
    return !!flags[ownerIndex];
  } catch {
    return false;
  }
}

function setRevealActive(ownerIndex, value){
  if (!Number.isFinite(ownerIndex)) return;
  try {
    const flags = getRevealActiveFlags();
    const prev = !!flags[ownerIndex];
    const next = !!value;
    if (prev === next) return;
    flags[ownerIndex] = next;
    if (!next) {
      if (typeof window !== 'undefined' && typeof window.updateUI === 'function') {
        const schedule = () => {
          try { window.updateUI(); } catch {}
        };
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(schedule);
        } else {
          setTimeout(schedule, 16);
        }
      }
    }
  } catch {}
}
function setAnim(v){ try { window.PENDING_MANA_ANIM = v; } catch {} }

// Sync with legacy flags
function getManaGainActive(){ try { return !!(typeof window !== 'undefined' && window.manaGainActive); } catch { return false; } }
function setManaGainActive(v){ try { if (typeof window !== 'undefined') { window.manaGainActive = !!v; } } catch {} }

// Очередь отложенных подсветок на панелях маны
function getRevealQueueRoot(){
  try {
    if (typeof window === 'undefined') return [[], []];
    if (!Array.isArray(window.__PENDING_MANA_REVEAL)) {
      window.__PENDING_MANA_REVEAL = [[], []];
    }
    const root = window.__PENDING_MANA_REVEAL;
    if (!Array.isArray(root[0])) root[0] = [];
    if (!Array.isArray(root[1])) root[1] = [];
    return root;
  } catch {
    return [[], []];
  }
}

function enqueueReveal(ownerIndex, info){
  if (!Number.isFinite(ownerIndex)) return;
  try {
    if (typeof window === 'undefined') return;
    const root = getRevealQueueRoot();
    root[ownerIndex] = Array.isArray(root[ownerIndex]) ? root[ownerIndex] : [];
    root[ownerIndex].push(info);
  } catch {}
}

function peekReveal(ownerIndex){
  try {
    const root = getRevealQueueRoot();
    if (!Array.isArray(root[ownerIndex]) || !root[ownerIndex].length) return null;
    return root[ownerIndex][0] || null;
  } catch {
    return null;
  }
}

function shiftReveal(ownerIndex){
  try {
    const root = getRevealQueueRoot();
    if (!Array.isArray(root[ownerIndex]) || !root[ownerIndex].length) return null;
    return root[ownerIndex].shift();
  } catch {
    return null;
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
    if (isRevealActive(p)) {
      continue;
    }
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

    const revealCandidate = peekReveal(p);
    let revealRange = null;
    if (revealCandidate && Number.isFinite(revealCandidate.from) && Number.isFinite(revealCandidate.to)) {
      const from = Math.max(0, Math.floor(revealCandidate.from));
      const to = Math.max(from, Math.floor(revealCandidate.to));
      if (to > from) {
        revealRange = { from, to };
      }
    }
    let revealMatched = false;

    for (let i = 0; i < total; i++) {
      const orb = document.createElement('div');
      const filled = i < renderMana;
      const isBlockedForAnim = !!(pending && i >= pending.startIdx && i <= pending.endIdx);
      orb.className = filled ? 'mana-orb' : 'mana-slot';

      const wasVisible = existingOrbs[i] && existingOrbs[i].classList && existingOrbs[i].classList.contains('mana-orb');
      const isRevealOrb = !!(revealRange && filled && i >= revealRange.from && i < revealRange.to);
      if (isRevealOrb) {
        revealMatched = true;
        if (animateAllowed) {
          try {
            markOrbAnimating(orb);
            orb.style.opacity = '0';
            orb.style.transform = 'scale(0.6)';
          } catch {}
          enforceOrbRestore(orb, 900);
        }
      }

      const baseOpacity = (!animateAllowed)
        ? '1'
        : ((filled && wasVisible) ? '1' : (filled ? '0' : '1'));
      orb.style.opacity = baseOpacity;
      manaDisplay.appendChild(orb);

      if (animateAllowed && filled && !isBlockedForAnim && !wasVisible && !isRevealOrb) {
        const delay = 0.06 * Math.max(0, i - prev);
        setTimeout(() => {
          try {
            markOrbAnimating(orb);
            orb.style.transform = 'translateX(16px) scale(0.6)';
            orb.style.transition = 'transform 220ms ease, opacity 220ms ease';
            requestFrame(() => {
              try {
                orb.style.opacity = '1';
                orb.style.transform = 'translateX(0) scale(1)';
              } finally {
                markOrbStable(orb);
              }
            });
            enforceOrbRestore(orb, 420);
          } catch {}
        }, delay * 1000);
      }
    }

    if (revealRange && revealMatched) {
      if (animateAllowed) {
        const hasTimeline = (typeof window !== 'undefined') && !!window.gsap?.timeline;
        if (!hasTimeline) {
          try {
            manaDisplay.style.transition = 'filter 260ms ease';
            manaDisplay.style.filter = 'brightness(2.05)';
            setTimeout(() => { try { manaDisplay.style.filter = 'none'; } catch {} }, 360);
          } catch {}
        }
      }
      shiftReveal(p);
    }
  }
}

// Вспомогательный генератор эффектов раскрытия орбов на панели
function markOrbAnimating(el) {
  try {
    if (el && el.dataset) {
      el.dataset.manaOrbState = 'animating';
    }
  } catch {}
}

function markOrbStable(el) {
  try {
    if (el && el.dataset) {
      el.dataset.manaOrbState = 'stable';
    }
  } catch {}
}

function finalizeOrbVisual(el) {
  if (!el) return;
  try {
    el.style.transform = '';
    el.style.opacity = '';
    el.style.boxShadow = '';
    el.style.willChange = '';
    el.style.transformOrigin = '';
    el.style.filter = '';
  } catch {}
  markOrbStable(el);
}

function enforceOrbRestore(el, timeoutMs = 720) {
  if (!el) return;
  setTimeout(() => {
    try {
      if (!el.dataset || el.dataset.manaOrbState === 'stable') return;
      finalizeOrbVisual(el);
    } catch {}
  }, timeoutMs);
}

function requestFrame(fn) {
  try {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(fn);
      return;
    }
  } catch {}
  setTimeout(fn, 16);
}

// Вспомогательный генератор эффектов раскрытия орбов на панели
function populatePanelBurst(tl, bar, indices, sparks, { highlight = true, finalizeTargets = null } = {}) {
  if (!tl || !bar || !Array.isArray(indices) || !indices.length) return;
  const perOrbDelay = 0.12;

  for (const [order, idx] of indices.entries()) {
    const el = bar.children?.[idx];
    if (!el) continue;

    if (Array.isArray(finalizeTargets)) {
      finalizeTargets.push(el);
    }

    const revealAt = Math.max(0, order * perOrbDelay);

    // Подготавливаем элемент перед включением эффекта
    tl.call(() => {
      try {
        el.style.willChange = 'transform, box-shadow, filter, opacity';
        el.style.transformOrigin = '50% 50%';
        if (el.className !== 'mana-orb') {
          el.className = 'mana-orb';
        }
        el.style.opacity = '0';
        el.style.transform = 'scale(0.58)';
        markOrbAnimating(el);
        enforceOrbRestore(el, 900);
      } catch {}
    }, null, revealAt);

    if (highlight && order === 0) {
      tl.to(bar, {
        filter: 'brightness(2.05) drop-shadow(0 0 18px rgba(96,165,250,0.95))',
        duration: 0.18,
        ease: 'power2.out',
      }, revealAt).to(bar, {
        filter: 'none',
        duration: 0.32,
        ease: 'power2.inOut',
      }, revealAt + 0.18);
    }

      tl.to(el, {
        duration: 0.196,
        ease: 'back.out(2.2)',
        onStart: () => {
          try {
            el.style.boxShadow = '0 0 22px rgba(96,165,250,0.95), 0 0 44px rgba(56,189,248,0.85)';
            el.style.opacity = '1';
          } catch {}
        },
        onComplete: () => {
          try { el.style.boxShadow = '0 0 12px rgba(30,160,255,0.85)'; } catch {}
        },
      }, revealAt)
      .to(el, { scale: 2.5, duration: 0.196, ease: 'back.out(2.2)' }, revealAt)
      .to(el, { scale: 1.0, duration: 0.42, ease: 'power2.inOut' }, revealAt + 0.196)
      .call(() => finalizeOrbVisual(el), null, revealAt + 0.196 + 0.42);

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const sparkCount = 16;

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
          delay: 0.105,
        }, `>-0.1`);
    }
  }

  const totalDuration = (indices.length - 1) * perOrbDelay + 0.72;
  tl.to({}, { duration: Math.max(0, totalDuration - tl.duration()) });
}

function cleanupSparks(sparks) {
  if (!Array.isArray(sparks)) return;
  for (const s of sparks) {
    try { if (s && s.parentNode) s.parentNode.removeChild(s); } catch {}
  }
}

export function animateManaGainFromWorld(pos, ownerIndex, visualOnlyMaybe = true, legacyArg = null, legacyOpts = {}) {
  try {
    let visualOnly = true;
    let opts = {};
    if (typeof visualOnlyMaybe === 'object' && visualOnlyMaybe !== null) {
      opts = visualOnlyMaybe;
      visualOnly = (visualOnlyMaybe.visualOnly != null) ? !!visualOnlyMaybe.visualOnly : true;
    } else {
      visualOnly = !!visualOnlyMaybe;
      if (legacyArg && typeof legacyArg === 'object' && (!legacyOpts || Object.keys(legacyOpts).length === 0)) {
        opts = legacyArg;
      } else if (legacyOpts && typeof legacyOpts === 'object') {
        opts = legacyOpts;
      }
    }
    if (opts.visualOnly != null) {
      visualOnly = !!opts.visualOnly;
    }

    const amountRaw = opts.amount ?? opts.count ?? 1;
    const amount = Math.max(0, Math.floor(Number.isFinite(amountRaw) ? amountRaw : Number(amountRaw) || 0));
    if (amount <= 0) return;

    const startDelayMs = Math.max(0, Number.isFinite(opts.startDelayMs)
      ? Number(opts.startDelayMs)
      : (Number.isFinite(opts.delayMs) ? Number(opts.delayMs) : 0));
    const floatDuration = Math.max(0.6, Number.isFinite(opts.floatDuration) ? Number(opts.floatDuration) : 1.05);
    const floatDistance = Number.isFinite(opts.floatDistance) ? Number(opts.floatDistance) : 170;
    const labelHoldMs = Math.max(0, Number.isFinite(opts.labelHoldMs) ? Number(opts.labelHoldMs) : 680);
    const fadeOutMs = Math.max(180, Number.isFinite(opts.fadeOutMs) ? Number(opts.fadeOutMs) : 320);
    const labelText = typeof opts.label === 'string' ? opts.label : `+${amount}`;
    const flashScale = Number.isFinite(opts.flashScale) ? Math.max(1.5, Number(opts.flashScale)) : 3.6;
    const revealTime = (() => {
      const rise = floatDuration;
      const safeEnd = Math.max(0.18, rise - 0.12);
      const weighted = Math.max(0.32, Math.min(safeEnd, rise * 0.7));
      return weighted;
    })();

    const gameState = (typeof window !== 'undefined') ? window.gameState : null;

    if (visualOnly && Number.isFinite(ownerIndex)) {
      const blocks = getBlocks();
      if (Array.isArray(blocks)) {
        blocks[ownerIndex] = Math.max(0, Number(blocks[ownerIndex] || 0)) + amount;
        setBlocks(blocks);
        try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
      }
    }

    setTimeout(() => {
      let container = null;
      let cleanupTriggered = false;
      let revealTriggered = false;
      const cleanup = () => {
        if (cleanupTriggered) return;
        cleanupTriggered = true;
        try { if (container && container.parentNode) container.parentNode.removeChild(container); } catch {}
        triggerReveal();
      };

      const triggerReveal = () => {
        if (revealTriggered) return;
        revealTriggered = true;
        if (visualOnly && Number.isFinite(ownerIndex)) {
          const blocks = getBlocks();
          const beforeBlock = Array.isArray(blocks)
            ? Math.max(0, Number(blocks[ownerIndex] || 0))
            : 0;
          const afterBlock = Math.max(0, beforeBlock - amount);
          if (Array.isArray(blocks)) {
            blocks[ownerIndex] = afterBlock;
            setBlocks(blocks);
          }
          const targetMana = Math.max(0, Number(gameState?.players?.[ownerIndex]?.mana) || 0);
          const prevVisible = Math.max(0, targetMana - beforeBlock);
          const visibleNow = Math.max(0, targetMana - afterBlock);
          const revealCount = Math.max(0, visibleNow - prevVisible);
          if (revealCount > 0) {
            enqueueReveal(ownerIndex, { from: prevVisible, to: visibleNow, amount: revealCount });
          }
          const indices = [];
          for (let idx = prevVisible; idx < visibleNow; idx++) indices.push(idx);
          try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}

          const scheduleEffect = () => {
            try {
              const bar = document.getElementById(`mana-display-${ownerIndex}`);
              if (bar && typeof window !== 'undefined' && window.gsap?.timeline) {
                const sparks = [];
                const finalizeTargets = [];
                const finalizeReveal = () => {
                  cleanupSparks(sparks);
                  for (const target of finalizeTargets) {
                    finalizeOrbVisual(target);
                  }
                  setRevealActive(ownerIndex, false);
                };
                setRevealActive(ownerIndex, true);
                try {
                  const tl = window.gsap.timeline({ onComplete: finalizeReveal });
                  if (typeof tl.eventCallback === 'function') {
                    tl.eventCallback('onInterrupt', finalizeReveal);
                  }
                  populatePanelBurst(tl, bar, indices, sparks, { highlight: true, finalizeTargets });
                } catch (err) {
                  finalizeReveal();
                  console.error('[mana] Ошибка запуска раскрытия панели:', err);
                }
              }
            } catch (err) {
              setRevealActive(ownerIndex, false);
              console.error('[mana] Не удалось подготовить анимацию панели маны:', err);
            }
          };

          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(scheduleEffect);
          } else {
            setTimeout(scheduleEffect, 16);
          }
        }
      };

      try {
        const source = pos && typeof pos?.clone === 'function'
          ? pos.clone()
          : (pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
        if (!source) return;
        const start = worldToScreen(source);
        container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = `${start.x}px`;
        container.style.top = `${start.y}px`;
        container.style.transform = 'translate(-50%, -50%) scale(0.72)';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '120';
        container.style.opacity = '0';
        document.body.appendChild(container);

        const orb = document.createElement('div');
        orb.style.width = '28px';
        orb.style.height = '28px';
        orb.style.borderRadius = '50%';
        orb.style.background = 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.95) 55%, rgba(14,165,233,0.55) 100%)';
        orb.style.boxShadow = '0 0 26px rgba(56,189,248,0.9)';
        orb.style.opacity = '0.9';
        orb.style.transform = 'scale(0.42)';
        container.appendChild(orb);

        const labelWrapper = document.createElement('div');
        labelWrapper.style.position = 'absolute';
        labelWrapper.style.left = '50%';
        labelWrapper.style.top = '50%';
        labelWrapper.style.transform = 'translate(-50%, -50%) translate(34px, -6px)';
        labelWrapper.style.opacity = '0';
        container.appendChild(labelWrapper);

        const label = document.createElement('span');
        label.textContent = labelText;
        label.style.fontFamily = 'var(--ui-font, "Montserrat", "Roboto", sans-serif)';
        label.style.fontWeight = '700';
        label.style.fontSize = '20px';
        label.style.color = '#a5f3fc';
        label.style.textShadow = '0 0 16px rgba(56,189,248,0.9), 0 0 32px rgba(14,165,233,0.75)';
        labelWrapper.appendChild(label);

        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.left = '50%';
        flash.style.top = '50%';
        flash.style.width = '18px';
        flash.style.height = '18px';
        flash.style.borderRadius = '50%';
        flash.style.background = 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(125,211,252,0.35) 55%, rgba(14,165,233,0) 100%)';
        flash.style.transform = 'translate(-50%, -50%) scale(0.24)';
        flash.style.opacity = '0';
        container.appendChild(flash);

        const tl = (typeof window !== 'undefined')
          ? window.gsap?.timeline?.({ onComplete: cleanup })
          : null;
        if (tl) {
          const floatSeconds = floatDuration;
          const holdSeconds = labelHoldMs / 1000;
          const fadeSeconds = fadeOutMs / 1000;
          tl.to(container, { opacity: 1, scale: 1, duration: 0.22, ease: 'back.out(1.8)' })
            .to(container, { y: -floatDistance, duration: floatSeconds, ease: 'power1.out' }, '<')
            .to(orb, { scale: 1, duration: 0.28, ease: 'back.out(2.1)' }, '<')
            .to(labelWrapper, { opacity: 1, duration: 0.26, ease: 'power2.out' }, '<+0.05')
            .to(labelWrapper, { y: -18, duration: Math.max(0.14, floatSeconds), ease: 'power1.out' }, '<')
            .add('reveal', revealTime)
            .call(triggerReveal, null, 'reveal')
            .to(orb, { opacity: 0, scale: 1.45, duration: Math.max(0.2, fadeSeconds), ease: 'power1.in' }, 'reveal')
            .to(flash, { opacity: 1, scale: flashScale, duration: 0.34, ease: 'power2.out' }, 'reveal')
            .to(flash, { opacity: 0, scale: flashScale * 1.08, duration: 0.32, ease: 'power2.in' }, 'reveal+0.18')
            .to(labelWrapper, { y: -46, duration: holdSeconds, ease: 'power1.out' }, 'reveal')
            .to(labelWrapper, { opacity: 0, duration: 0.32, ease: 'power1.in' }, `reveal+=${Math.max(0.16, holdSeconds - 0.12)}`)
            .to(container, { opacity: 0, duration: 0.34, ease: 'power1.inOut' });
        } else {
          container.style.opacity = '1';
          const raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
            ? window.requestAnimationFrame.bind(window)
            : (fn => setTimeout(() => fn(Date.now()), 16));
          const startTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          const floatMs = floatDuration * 1000;
          const revealMs = revealTime * 1000;
          const totalDuration = floatMs + labelHoldMs + fadeOutMs;
          const tick = (time) => {
            const current = (typeof time === 'number')
              ? time
              : ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now());
            const elapsed = Math.min(totalDuration, current - startTime);
            const progress = elapsed / (totalDuration || 1);
            const y = -floatDistance * progress;
            container.style.transform = `translate(-50%, -50%) translateY(${y}px)`;
            if (elapsed < totalDuration) {
              raf(tick);
            } else {
              cleanup();
            }
          };
          raf(tick);
          setTimeout(() => { try { labelWrapper.style.opacity = '1'; } catch {} }, 90);
          setTimeout(() => { try { flash.style.opacity = '1'; } catch {} }, Math.max(0, revealMs - 120));
          setTimeout(() => { triggerReveal(); }, Math.max(0, revealMs));
          setTimeout(() => { try { labelWrapper.style.opacity = '0'; } catch {} }, floatMs + labelHoldMs);
          setTimeout(() => { cleanup(); }, totalDuration + 32);
        }
      } catch (err) {
        console.error('[mana] Ошибка анимации орба маны:', err);
        try { cleanup(); } catch {}
      }
    }, startDelayMs);
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
      const finalizeTargets = [];

      const cleanup = () => {
        console.log(`[MANA] Cleaning up animation for player ${ownerIndex}`);
        for (const target of finalizeTargets) {
          finalizeOrbVisual(target);
        }
        cleanupSparks(sparks);
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
      
      const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
      if (!tl) {
        setTimeout(cleanup, durationMs);
        return;
      }

      if (typeof tl.eventCallback === 'function') {
        tl.eventCallback('onInterrupt', cleanup);
      }

      populatePanelBurst(tl, bar, indices, sparks, { highlight: true, finalizeTargets });

    } catch (e) {
      console.error('Error in animateTurnManaGain:', e);
      setManaGainActive(false);
      try { if (typeof window !== 'undefined' && typeof window.refreshInputLockUI === 'function') window.refreshInputLockUI(); } catch {}
      resolve();
    }
  });
}

export function animateManaSteal(event) {
  try {
    if (!event) return;
    const amountRaw = Number(event.amount || event.count || 0);
    const amount = Math.max(0, Math.floor(amountRaw));
    const fromIndex = Number.isInteger(event.from) ? event.from : null;
    const toIndex = Number.isInteger(event.to) ? event.to : null;
    if (amount <= 0 || fromIndex == null || toIndex == null) return;
    const fromBar = document.getElementById(`mana-display-${fromIndex}`);
    const toBar = document.getElementById(`mana-display-${toIndex}`);
    if (!fromBar || !toBar) return;

    const beforeFrom = Number.isFinite(event?.before?.fromMana)
      ? event.before.fromMana
      : (Number(event?.after?.fromMana) || 0) + amount;
    const beforeTo = Number.isFinite(event?.before?.toMana)
      ? event.before.toMana
      : Math.max(0, (Number(event?.after?.toMana) || 0) - amount);
    const afterTo = Number.isFinite(event?.after?.toMana)
      ? event.after.toMana
      : Math.min(10, beforeTo + amount);

    const fromSlots = [];
    for (let i = 0; i < amount; i += 1) {
      fromSlots.push(Math.max(0, Math.min(9, beforeFrom - 1 - i)));
    }
    const newSlots = [];
    for (let idx = beforeTo; idx < afterTo; idx += 1) {
      newSlots.push(Math.max(0, Math.min(9, idx)));
    }
    while (newSlots.length < amount) {
      const fallback = newSlots.length ? newSlots[newSlots.length - 1] : Math.max(0, Math.min(9, afterTo - 1));
      newSlots.push(fallback);
    }

    const getSlotRect = (barEl, idx) => {
      if (!barEl) return null;
      const child = barEl.children?.[idx];
      if (child) return child.getBoundingClientRect();
      if (barEl.children && barEl.children.length) {
        const last = barEl.children[Math.min(idx, barEl.children.length - 1)];
        if (last) return last.getBoundingClientRect();
      }
      return barEl.getBoundingClientRect();
    };

    const spawnSteal = (fromIdx, toIdx, delayMs) => {
      const fromRect = getSlotRect(fromBar, fromIdx);
      if (!fromRect) return;
      const orb = document.createElement('div');
      orb.className = 'mana-orb--steal-fx';
      orb.style.position = 'fixed';
      orb.style.left = `${fromRect.left + fromRect.width / 2}px`;
      orb.style.top = `${fromRect.top + fromRect.height / 2}px`;
      orb.style.transform = 'translate(-50%, -50%) scale(0.9)';
      orb.style.opacity = '0';
      orb.style.zIndex = '90';
      document.body.appendChild(orb);

      const ensureTargetVisible = () => {
        const targetEl = toBar.children?.[toIdx];
        if (targetEl) {
          targetEl.style.transition = 'opacity 220ms ease';
          targetEl.style.opacity = '1';
        }
      };

      const playArrival = () => {
        const targetRect = getSlotRect(toBar, toIdx);
        if (!targetRect) { ensureTargetVisible(); return; }
        const spark = document.createElement('div');
        spark.className = 'mana-orb--steal-gain';
        spark.style.position = 'fixed';
        spark.style.left = `${targetRect.left + targetRect.width / 2}px`;
        spark.style.top = `${targetRect.top + targetRect.height / 2}px`;
        spark.style.transform = 'translate(-50%, -50%) scale(0.4)';
        spark.style.opacity = '0';
        spark.style.zIndex = '92';
        document.body.appendChild(spark);
        const tlGain = window.gsap?.timeline({
          onComplete: () => {
            try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
            ensureTargetVisible();
          },
        });
        if (tlGain) {
          tlGain.to(spark, { duration: 0.15, opacity: 1, scale: 0.9, ease: 'power1.out' })
            .to(spark, { duration: 0.32, opacity: 0, scale: 1.2, ease: 'power2.in' }, '>-0.05');
        } else {
          spark.style.transition = 'opacity 180ms ease, transform 180ms ease';
          requestAnimationFrame(() => {
            spark.style.opacity = '1';
            spark.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => {
              spark.style.opacity = '0';
              spark.style.transform = 'translate(-50%, -50%) scale(1.2)';
              setTimeout(() => {
                try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
                ensureTargetVisible();
              }, 200);
            }, 200);
          });
        }
      };

      const targetEl = toBar.children?.[toIdx];
      if (targetEl) {
        targetEl.style.opacity = '0';
      }

      const cleanup = () => {
        try { if (orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
        playArrival();
      };

      const tl = window.gsap?.timeline({ delay: Math.max(0, delayMs) / 1000, onComplete: cleanup });
      if (tl) {
        tl.to(orb, { duration: 0.2, opacity: 1, scale: 1.05, ease: 'power2.out' })
          .to(orb, { duration: 0.36, y: '-32', ease: 'power1.out' }, '>-0.06')
          .to(orb, { duration: 0.28, opacity: 0, scale: 0.6, ease: 'power2.in' }, '>-0.2');
      } else {
        setTimeout(() => {
          orb.style.transition = 'transform 260ms ease, opacity 260ms ease';
          requestAnimationFrame(() => {
            orb.style.opacity = '1';
            orb.style.transform = 'translate(-50%, -80%) scale(1.05)';
            setTimeout(() => {
              orb.style.opacity = '0';
              orb.style.transform = 'translate(-50%, -110%) scale(0.6)';
              setTimeout(cleanup, 260);
            }, 200);
          });
        }, Math.max(0, delayMs));
      }
    };

    for (let i = 0; i < amount; i += 1) {
      const fromIdx = fromSlots[i] ?? fromSlots[fromSlots.length - 1] ?? 0;
      const toIdx = newSlots[i] ?? newSlots[newSlots.length - 1] ?? 0;
      spawnSteal(fromIdx, toIdx, i * 140);
    }
  } catch (err) {
    console.warn('[mana] animateManaSteal failed', err);
  }
}

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain, animateManaSteal };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;



