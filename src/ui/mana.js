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
    if (targetSlotMaybe && typeof targetSlotMaybe === 'object' && (!optionsMaybe || Object.keys(optionsMaybe).length === 0)) {
      opts = targetSlotMaybe;
      if (opts.visualOnly != null) visualOnly = !!opts.visualOnly;
    }

    const skipPanelUpdate = !!opts.skipPanelUpdate;
    const rawAmount = Number.isFinite(opts.amount) ? opts.amount : opts.count;
    const plannedAmount = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 1;
    const amountBase = Math.max(0, plannedAmount);
    const startDelayMs = Math.max(0, Number.isFinite(opts.startDelayMs) ? Number(opts.startDelayMs) : 0);
    const floatDurationMs = Math.max(400, Number.isFinite(opts.floatDurationMs) ? Number(opts.floatDurationMs) : 1000);
    const labelHangMs = Math.max(280, Number.isFinite(opts.labelHangMs) ? Number(opts.labelHangMs) : 620);
    const floatDistance = Number.isFinite(opts.floatDistance) ? Number(opts.floatDistance) : 120;
    const panelDurationMs = Math.max(520, Number.isFinite(opts.panelDurationMs) ? Number(opts.panelDurationMs) : 720);

    let before = Number.isFinite(opts.before) ? Number(opts.before) : null;
    let after = Number.isFinite(opts.after) ? Number(opts.after) : null;

    const gameState = (typeof window !== 'undefined') ? window.gameState : null;
    if (!Number.isFinite(before) && Number.isFinite(ownerIndex) && gameState?.players?.[ownerIndex]) {
      const current = Math.max(0, Number(gameState.players[ownerIndex].mana || 0));
      if (!Number.isFinite(after)) after = current;
      if (!Number.isFinite(before)) {
        const estimate = Math.max(0, (after != null ? after : current) - amountBase);
        before = estimate;
      }
    }
    if (!Number.isFinite(after) && Number.isFinite(before)) {
      after = before + amountBase;
    }

    const actualGain = Number.isFinite(before) && Number.isFinite(after)
      ? Math.max(0, Math.floor(after - before))
      : amountBase;
    if (actualGain <= 0 && !skipPanelUpdate) {
      return;
    }
    const displayAmount = Math.max(0, actualGain || amountBase || 0);
    const labelText = typeof opts.labelText === 'string' ? opts.labelText : `+${displayAmount}`;

    const reserveBlocks = () => {
      if (skipPanelUpdate) return;
      if (!visualOnly) return;
      if (typeof ownerIndex !== 'number') return;
      const list = Array.isArray(getBlocks()) ? [...getBlocks()] : [0, 0];
      const next = list.slice(0, 2);
      next[ownerIndex] = Math.max(0, (next[ownerIndex] || 0) + displayAmount);
      setBlocks(next);
    };

    let blocksReleased = skipPanelUpdate;
    const releaseBlocks = () => {
      if (blocksReleased) return;
      blocksReleased = true;
      if (skipPanelUpdate) return;
      if (!visualOnly) return;
      if (typeof ownerIndex !== 'number') return;
      const list = Array.isArray(getBlocks()) ? [...getBlocks()] : [0, 0];
      const next = list.slice(0, 2);
      next[ownerIndex] = Math.max(0, (next[ownerIndex] || 0) - displayAmount);
      setBlocks(next);
    };

    reserveBlocks();

    const schedule = () => {
      try {
        const source = pos && typeof pos.clone === 'function'
          ? pos.clone()
          : (pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
        if (!source) {
          releaseBlocks();
          return;
        }

        const start = worldToScreen(source);
        if (!start || !Number.isFinite(start.x) || !Number.isFinite(start.y)) {
          releaseBlocks();
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'mana-soul-wrapper';
        wrapper.style.position = 'fixed';
        wrapper.style.left = `${start.x}px`;
        wrapper.style.top = `${start.y}px`;
        wrapper.style.transform = 'translate(-50%, -50%) scale(0.6)';
        wrapper.style.opacity = '0';
        wrapper.style.zIndex = '80';
        wrapper.style.pointerEvents = 'none';

        const orb = document.createElement('div');
        orb.className = 'mana-soul-orb';

        const flash = document.createElement('div');
        flash.className = 'mana-soul-flash';

        const label = document.createElement('div');
        label.className = 'mana-soul-label';
        label.textContent = labelText;

        wrapper.appendChild(flash);
        wrapper.appendChild(orb);
        wrapper.appendChild(label);
        document.body.appendChild(wrapper);

        let panelTriggered = false;
        const triggerPanel = () => {
          if (panelTriggered) return;
          panelTriggered = true;
          if (skipPanelUpdate) return;
          releaseBlocks();
          if (Number.isFinite(before) && Number.isFinite(after) && after > before && window?.__ui?.mana?.animateTurnManaGain) {
            try {
              window.__ui.mana.animateTurnManaGain(ownerIndex, before, after, panelDurationMs).catch?.(() => {});
            } catch (err) {
              console.error('[mana] Ошибка запуска анимации панели маны:', err);
            }
          } else {
            try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
          }
        };

        const cleanup = () => {
          try { if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); } catch {}
          if (!panelTriggered) {
            triggerPanel();
          }
        };

        const floatSeconds = floatDurationMs / 1000;
        const labelHangSeconds = labelHangMs / 1000;
        const fadeStart = Math.max(0, floatSeconds - 0.28);
        const flashIn = Math.max(0, floatSeconds - 0.24);
        const flashOut = Math.max(0, floatSeconds - 0.06);
        const appearTime = 0.12;

        const tl = (typeof window !== 'undefined')
          ? window.gsap?.timeline?.({ onComplete: cleanup })
          : null;

        if (tl) {
          tl.set(wrapper, { opacity: 0, scale: 0.6, y: 0 });
          tl.set(label, { opacity: 0, y: 0 });
          tl.set(flash, { opacity: 0, scale: 0.6 });

          tl.to(wrapper, { opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out' }, 0)
            .to(wrapper, { y: -floatDistance, duration: floatSeconds, ease: 'power1.out' }, 0)
            .to(orb, { opacity: 0, scale: 1.6, duration: 0.3, ease: 'power1.in' }, fadeStart)
            .to(flash, { opacity: 1, scale: 1.3, duration: 0.18, ease: 'power2.out' }, flashIn)
            .to(flash, { opacity: 0, scale: 2.2, duration: 0.26, ease: 'power1.in' }, flashOut)
            .to(label, { opacity: 1, duration: 0.18, ease: 'power2.out' }, appearTime)
            .to(label, { y: -floatDistance - 18, duration: floatSeconds + labelHangSeconds, ease: 'power1.out' }, appearTime)
            .call(triggerPanel, null, floatSeconds + 0.05)
            .to(label, { opacity: 0, duration: 0.32, ease: 'power1.in' }, floatSeconds + labelHangSeconds);
        } else {
          const transition = `transform ${floatDurationMs}ms ease-out, opacity 220ms ease-out`;
          wrapper.style.transition = transition;
          label.style.transition = `transform ${floatDurationMs + labelHangMs}ms ease-out, opacity 320ms ease-in-out`;
          orb.style.transition = 'opacity 280ms ease-in, transform 280ms ease-in';
          flash.style.transition = 'opacity 260ms ease, transform 260ms ease';
          requestAnimationFrame(() => {
            wrapper.style.opacity = '1';
            wrapper.style.transform = `translate(-50%, -50%) translateY(${-floatDistance}px) scale(1)`;
            label.style.opacity = '1';
            label.style.transform = `translate(-50%, -50%) translateY(${-floatDistance - 18}px)`;
            setTimeout(() => {
              orb.style.opacity = '0';
              orb.style.transform = 'scale(1.6)';
              flash.style.opacity = '1';
              flash.style.transform = 'scale(1.3)';
              setTimeout(() => {
                flash.style.opacity = '0';
                flash.style.transform = 'scale(2.2)';
              }, 180);
            }, Math.max(0, floatDurationMs - 280));
          });
          setTimeout(triggerPanel, floatDurationMs + 60);
          setTimeout(() => { label.style.opacity = '0'; }, floatDurationMs + labelHangMs);
          setTimeout(cleanup, floatDurationMs + labelHangMs + 420);
        }
      } catch (err) {
        releaseBlocks();
        console.error('[mana] Ошибка анимации вылета маны:', err);
      }
    };

    if (startDelayMs > 0) {
      setTimeout(schedule, startDelayMs);
    } else {
      schedule();
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

const api = { renderBars, animateManaGainFromWorld, animateTurnManaGain };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.mana = api; } } catch {}
export default api;



