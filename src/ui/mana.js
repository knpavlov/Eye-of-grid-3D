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

export function animateManaGainFromWorld(pos, ownerIndex, visualOnlyOrOptions = true, maybeTargetSlot = null, maybeOptions = null) {
  let visualOnly = typeof visualOnlyOrOptions === 'boolean' ? visualOnlyOrOptions : true;
  let targetSlot = maybeTargetSlot;
  let options = {};

  if (visualOnlyOrOptions && typeof visualOnlyOrOptions === 'object') {
    options = { ...visualOnlyOrOptions };
    visualOnly = options.visualOnly ?? visualOnly;
    if (options.targetSlot != null) targetSlot = options.targetSlot;
    if (options.startSlot != null) targetSlot = options.startSlot;
  } else if (maybeTargetSlot && typeof maybeTargetSlot === 'object') {
    options = { ...maybeTargetSlot };
    if (options.targetSlot != null) targetSlot = options.targetSlot;
    if (options.startSlot != null) targetSlot = options.startSlot;
  } else if (maybeOptions && typeof maybeOptions === 'object') {
    options = { ...maybeOptions };
  }

  if (typeof visualOnly !== 'boolean') visualOnly = true;

  // Поддержка множественных орбов от одного источника
  const amount = Math.max(1, Math.floor(options.amount ?? 1));
  const initialDelay = Math.max(0, Number(options.initialDelayMs) || 0);
  const spreadDelay = Math.max(0, Number(options.spreadDelayMs ?? options.delayBetween ?? 90));
  const slotStep = Math.max(1, Math.floor(options.slotStep ?? 1));
  const startSlot = (options.startSlot != null) ? options.startSlot : targetSlot;
  const accelerate = options.accelerate !== false;

  const scheduleSingle = (slot, delayMs) => {
    const run = () => {
      try {
        const start = worldToScreen(pos);
        const barEl = document.getElementById(`mana-display-${ownerIndex}`);
        if (!barEl) return;
        const gameState = (typeof window !== 'undefined') ? window.gameState : null;

        let currentMana = Math.max(0, (gameState?.players?.[ownerIndex]?.mana) || 0);
        const currentBlocks = Math.max(0, Number(getBlocks()?.[ownerIndex]) || 0);

        let targetIdx;
        if (typeof slot === 'number') {
          targetIdx = Math.max(0, Math.min(9, slot));
        } else if (visualOnly) {
          try {
            const filledNow = Array.from(barEl.children).filter(el => el && el.classList && el.classList.contains('mana-orb')).length;
            targetIdx = Math.min(9, Math.max(0, filledNow));
          } catch {
            const visibleMana = Math.max(0, currentMana - currentBlocks);
            targetIdx = Math.min(9, visibleMana);
          }
        } else {
          targetIdx = Math.max(0, Math.min(9, currentMana - 1));
        }

        if (visualOnly && typeof ownerIndex === 'number') {
          const b = getBlocks();
          b[ownerIndex] = Math.max(0, (b[ownerIndex] || 0) + 1);
          setBlocks(b);
          try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
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
          const rect = barEl.getBoundingClientRect();
          tx = rect.left + rect.width / 2;
          ty = rect.top + rect.height / 2;
        }

        const orb = document.createElement('div');
        orb.className = 'mana-orb';
        orb.style.position = 'fixed';
        orb.style.left = `${start.x}px`;
        orb.style.top = `${start.y}px`;
        orb.style.transform = 'translate(-50%, -50%) scale(0.3)';
        orb.style.opacity = '0';
        orb.style.zIndex = '60';
        document.body.appendChild(orb);

        const cleanup = () => {
          try { if (orb && orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
          if (visualOnly && typeof ownerIndex === 'number') {
            const b2 = getBlocks();
            b2[ownerIndex] = Math.max(0, (b2[ownerIndex] || 0) - 1);
            setBlocks(b2);
            try { if (typeof window.updateUI === 'function') window.updateUI(); } catch {}
          }
        };

        const tl = (typeof window !== 'undefined') ? window.gsap?.timeline?.({ onComplete: cleanup }) : null;
        if (tl) {
          const travel = Number.isFinite(options.travelDuration) ? Math.max(0.2, options.travelDuration) : 1.4;
          const phaseA = Math.max(0.18, travel * 0.55);
          const phaseB = Math.max(0.14, travel - phaseA);
          const midX = start.x + (tx - start.x) * 0.55;
          const midY = start.y + (ty - start.y) * 0.55;

          tl.to(orb, {
            duration: 0.42,
            ease: 'back.out(1.4)',
            opacity: 1,
            transform: 'translate(-50%, -50%) scale(1)',
          })
            .to(orb, {
              duration: phaseA,
              ease: 'power1.out',
              left: midX,
              top: midY,
            }, '>-0.06')
            .to(orb, {
              duration: phaseB,
              ease: accelerate ? 'power3.in' : 'power2.inOut',
              left: tx,
              top: ty,
              scale: 1.18,
            }, '>-0.04')
            .to(orb, {
              duration: 0.18,
              ease: 'power1.out',
              scale: 1.0,
            }, '>-0.12');
        } else {
          cleanup();
        }
      } catch {}
    };

    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  };

  for (let i = 0; i < amount; i += 1) {
    const slot = (startSlot != null) ? Math.max(0, Math.min(9, startSlot + i * slotStep)) : null;
    const delayMs = initialDelay + i * spreadDelay;
    scheduleSingle(slot, delayMs);
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
      
      const delayPerOrb = 0.12;
      let barFlashScheduled = false;
      for (const idx of indices) {
        const el = bar.children[idx];
        if (!el) continue;

        // Подготавливаем элемент для анимации
        el.style.willChange = 'transform, box-shadow, filter, opacity';
        el.style.transformOrigin = '50% 50%';

        const order = Math.max(0, idx - startIdx);
        const t0 = order * delayPerOrb;
        const label = `orb-${idx}`;

        // На старте убеждаемся что элемент существует как пустая ячейка, затем превращаем в орб + вспышка
        tl.addLabel(label, t0)
          .call(() => {
          try {
            if (el.className !== 'mana-orb') {
              el.className = 'mana-orb';
              el.style.opacity = '0';
            }
          } catch {}
        }, null, label)
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
          }, label)
          .to(el, { scale: 2.5, duration: 0.196, ease: 'back.out(2.2)' }, label)
          .to(el, { scale: 1.0, duration: 0.42, ease: 'power2.inOut' }, `${label}+=0.196`);

        if (!barFlashScheduled) {
          barFlashScheduled = true;
          tl.to(bar, {
            filter: 'brightness(2.1) drop-shadow(0 0 16px rgba(96,165,250,0.95))',
            duration: 0.18,
            ease: 'power2.out',
          }, label)
            .to(bar, {
              filter: 'none',
              duration: 0.36,
              ease: 'power2.inOut',
            }, `${label}+=0.18`);
        }

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



