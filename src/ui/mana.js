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
      if (isRevealOrb) revealMatched = true;

      if (isRevealOrb && animateAllowed) {
        try { orb.style.boxShadow = '0 0 20px rgba(56,189,248,0.85)'; } catch {}
        orb.style.opacity = '0';
        orb.style.transform = 'scale(0.58)';
        manaDisplay.appendChild(orb);
        requestAnimationFrame(() => {
          try {
            orb.style.transition = 'transform 260ms ease, opacity 260ms ease, box-shadow 360ms ease';
            orb.style.opacity = '1';
            orb.style.transform = 'scale(1)';
            setTimeout(() => { try { orb.style.boxShadow = ''; } catch {} }, 360);
          } catch {}
        });
        continue;
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
            orb.style.transform = 'translateX(16px) scale(0.6)';
            orb.style.transition = 'transform 220ms ease, opacity 220ms ease';
            requestAnimationFrame(() => {
              orb.style.opacity = '1';
              orb.style.transform = 'translateX(0) scale(1)';
            });
          } catch {}
        }, delay * 1000);
      }
    }

    if (revealRange && revealMatched) {
      if (animateAllowed) {
        try {
          const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.() : null;
          if (tl) {
            tl.to(manaDisplay, {
              filter: 'brightness(2.05) drop-shadow(0 0 18px rgba(56,189,248,0.8))',
              duration: 0.18,
              ease: 'power2.out',
            }).to(manaDisplay, {
              filter: 'none',
              duration: 0.32,
              ease: 'power2.inOut',
            });
          } else {
            manaDisplay.style.transition = 'filter 260ms ease';
            manaDisplay.style.filter = 'brightness(2.05)';
            setTimeout(() => { try { manaDisplay.style.filter = 'none'; } catch {} }, 360);
          }
        } catch {}
      }
      shiftReveal(p);
    }
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
      const cleanup = () => {
        if (cleanupTriggered) return;
        cleanupTriggered = true;
        try { if (container && container.parentNode) container.parentNode.removeChild(container); } catch {}
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
          try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
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

        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.position = 'absolute';
        label.style.left = '36px';
        label.style.top = '-6px';
        label.style.fontFamily = 'var(--ui-font, "Montserrat", "Roboto", sans-serif)';
        label.style.fontWeight = '700';
        label.style.fontSize = '20px';
        label.style.color = '#a5f3fc';
        label.style.textShadow = '0 0 16px rgba(56,189,248,0.9), 0 0 32px rgba(14,165,233,0.75)';
        label.style.opacity = '0';
        container.appendChild(label);

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
            .to(label, { opacity: 1, y: -18, duration: 0.3, ease: 'power2.out' }, '<+0.08')
            .to(label, { y: -42, duration: Math.max(0.12, floatSeconds + holdSeconds - 0.3), ease: 'power1.out' }, '<')
            .to(orb, { opacity: 0, scale: 1.45, duration: Math.max(0.2, fadeSeconds), ease: 'power1.in' }, `>-${Math.min(fadeSeconds, 0.32)}`)
            .to(flash, { opacity: 1, scale: flashScale, duration: 0.34, ease: 'power2.out' }, `>-${Math.min(0.28, fadeSeconds)}`)
            .to(flash, { opacity: 0, scale: flashScale * 1.08, duration: 0.32, ease: 'power2.in' }, '>-0.16')
            .to(container, { opacity: 0, duration: 0.34, ease: 'power1.inOut' })
            .to(label, { opacity: 0, duration: 0.32, ease: 'power1.in' }, `>-${Math.max(0.22, fadeSeconds)}`);
        } else {
          container.style.opacity = '1';
          const raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
            ? window.requestAnimationFrame.bind(window)
            : (fn => setTimeout(() => fn(Date.now()), 16));
          const startTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          const totalDuration = floatDuration * 1000 + labelHoldMs + fadeOutMs;
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
          setTimeout(() => { try { label.style.opacity = '1'; } catch {} }, 90);
          setTimeout(() => { try { label.style.opacity = '0'; } catch {} }, floatDuration * 1000 + labelHoldMs);
          setTimeout(() => { try { flash.style.opacity = '1'; } catch {} }, Math.max(0, floatDuration * 1000 - 160));
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

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;



