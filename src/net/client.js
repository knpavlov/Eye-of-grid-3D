  /* MODULE: network/multiplayer
     Purpose: handle server connection, matchmaking, state sync,
     countdowns, and input locking. */
(() => {
  // ===== 0) Config =====
  const SERVER_URL = (location.hostname === "localhost")
    ? "http://localhost:3001"
    : "https://eog-mp-server-production.up.railway.app"; // ← домен сервера

  // ===== 1) Styles =====
  const css = `
  .mp-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:9999}
  .mp-card{min-width:280px;padding:18px 20px;border-radius:12px;background:#0f172a;color:#e5e7eb;border:1px solid #334155;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center}
  .mp-btn{display:inline-flex;gap:8px;align-items:center;justify-content:center;padding:6px 10px;border-radius:6px;cursor:pointer;background:#475569;color:#e5e7eb;border:1px solid rgba(255,255,255,0.1);font-size:12px}
  .mp-btn:hover{background:#64748b}
  .mp-subtle{color:#94a3b8;font-size:12px;margin-top:6px}
  .mp-spinner{width:16px;height:16px;border:2px solid #64748b;border-top-color:transparent;border-radius:50%;animation:mp-spin .8s linear infinite}
  @keyframes mp-spin{to{transform:rotate(360deg)}}
  .mp-count{font-weight:800;font-size:64px;letter-spacing:.03em;margin:8px 0 10px}
  .mp-seat{font-size:14px;color:#cbd5e1}
  .mp-floater{position:fixed;right:12px;bottom:12px;z-index:9998;display:flex;gap:8px}
  .mp-ind{position:fixed;left:12px;bottom:12px;z-index:9998;display:flex;align-items:center;gap:8px;background:rgba(15,23,42,.85);color:#e5e7eb;border:1px solid #334155;padding:6px 10px;border-radius:999px;font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .mp-dot{width:8px;height:8px;border-radius:50%;background:#64748b;box-shadow:0 0 0 2px rgba(0,0,0,.3) inset}
  .mp-dot.on{background:#16a34a}
  .mp-tag{padding:2px 6px;border-radius:999px;background:#1f2937;border:1px solid #334155}
  .mp-lock{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;pointer-events:auto;background:rgba(2,6,23,.35)}
  .mp-lock.on{display:flex}
  .mp-lock .mp-card{background:#0b1224cc}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ===== 2) Кнопка «Онлайн-игра» — как стандартные overlay-кнопки рядом с остальными =====
  function mountOnlineButton() {
    if (document.getElementById('find-match-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'find-match-btn';
    btn.className = 'overlay-panel px-3 py-1.5 text-xs bg-slate-600 hover:bg-slate-700 transition-colors';
    btn.textContent = 'Play Online';
    // Place inside the right-side control panel, next to other buttons
    const host = document.querySelector('#corner-right .flex') || document.getElementById('corner-right');
    if (host) {
      host.appendChild(btn);
    } else {
      // Fallback: if panel not yet mounted, use floater
      const wrap = document.getElementById('mp-floater') || (() => {
        const d = document.createElement('div'); d.id='mp-floater'; d.className='mp-floater'; document.body.appendChild(d); return d;
      })();
      wrap.appendChild(btn);
    }
    btn.addEventListener('click', onFindMatchClick);
  }
  mountOnlineButton();
  const mo = new MutationObserver(() => mountOnlineButton());
  mo.observe(document.body, { childList:true, subtree:true });

  // ===== 3) Queue modal + countdown =====
  let queueModal=null, startModal=null;
  function showQueueModal(){
    hideQueueModal();
    queueModal = document.createElement('div');
    queueModal.className='mp-modal';
    queueModal.innerHTML = `<div class="mp-card">
      <div style="display:flex;gap:10px;justify-content:center;align-items:center">
        <div class="mp-spinner"></div><div>Поиск матча…</div>
      </div><div class="mp-subtle">Ждём второго игрока</div></div>`;
    document.body.appendChild(queueModal);
  }
  function hideQueueModal(){ queueModal?.remove(); queueModal=null; }
  function showStartCountdown(seat, secs=3){
    hideStartCountdown();
    startModal = document.createElement('div');
    startModal.className='mp-modal';
    startModal.innerHTML = `<div class="mp-card">
      <div>Матч найден!</div>
      <div class="mp-seat">You play as: <b>${seat===0?'Player 1':'Player 2'}</b></div>
      <div class="mp-count" id="mp-count">${secs}</div>
      <div class="mp-subtle">Game is starting soon...</div></div>`;
    document.body.appendChild(startModal);
    let t=secs; const el=startModal.querySelector('#mp-count');
    const timer=setInterval(()=>{ t--; if(t<=0){ clearInterval(timer); hideStartCountdown(); onCountdownFinished(seat); } else el.textContent=t; },1000);
  }
  function hideStartCountdown(){ startModal?.remove(); startModal=null; }

  // ===== 4) Socket + sync =====
  const socket = io(SERVER_URL, { 
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: true,
    timeout: 20000,
    forceNew: true
  });
  try { window.socket = socket; } catch {}
  // NET_ACTIVE, MY_SEAT, APPLYING уже объявлены выше в глобальной области

  // --- SENDING: «обёртки» + DIGEST-пуллер ---
  const TO_WRAP = [
    // партия/ход
    'initGame','startGame','newGame','resetGame','endTurn','resign','setWinner',
    // колоды/руки
    'shuffleDeck','drawOne','drawCard','drawCards','dealCard','dealCards','discardCard','discardSelectedCard',
    // выбор/перетаскивание/цели
    'selectCard','deselectCard','resetCardSelection','onCardDropped','setTargetCell','setTargetUnit',
    // установка/направление
    'placeUnit','placeUnitWithDirection','rotateUnit','setFacing','setDirection',
    // бой/урон/смерть
    'performBattleSequence','stagedAttack','applyDamage','killUnit','removeUnit','reviveUnit',
    // контроль/победа
    'captureCell','changeOwner','checkWinCondition',
    // эффекты/ресурсы
    'castSpell','playSpell','applySpell','resolveSpell','applyEffect','removeEffect','spendMana','gainMana','updateMana',
    // UI триггеры
    'updateUI','updateUnits','updateHand','createBoard','createMetaObjects','addLog'
  ];
  const GATED = [
    'endTurn','placeUnit','placeUnitWithDirection','rotateUnit','performBattleSequence','stagedAttack',
    'applyDamage','killUnit','onCardDropped','castSpell','playSpell','resolveSpell','setTargetCell','setTargetUnit','setFacing','setDirection'
  ];
  function wrap(name){
    const fn = window[name];
    if (typeof fn !== 'function') return;
    window[name] = function(...args){
      // Блокируем ключевые действия, если сейчас не наш ход
      try {
        if (NET_ON() && GATED.includes(name)) {
          const myTurn = (typeof gameState?.active === 'number') && (gameState.active === MY_SEAT);
          if (!myTurn) { try { typeof showNotification==='function' && showNotification('Opponent\'s turn', 'error'); } catch {} return; }
        }
      } catch {}
      const r = fn.apply(this,args);
      // Если функция возвращает промис (async) — шлём после завершения
      if (r && typeof r.then === 'function') {
        return r.then((val)=>{
          // Ключевые события требуют обязательного пуша по завершении
          if (name === 'endTurn' || name === 'initGame' || name === 'startGame') {
            schedulePush(name, { force: true });
          } else {
            schedulePush(name);
          }
          return val;
        });
      }
      if (name === 'endTurn' || name === 'initGame' || name === 'startGame') {
        schedulePush(name, { force: true });
      } else {
        schedulePush(name);
      }
      return r;
    };
  }
  TO_WRAP.forEach(wrap);

  // digest: быстрый снимок значимых полей
  function digest(state){
    try {
      if (!state) return '';
      const compact = {
        active: state.active,
        turn: state.turn,
        winner: state.winner ?? null,
        players: (state.players||[]).map(p => ({
          mana: p.mana, max: p.maxMana,
          hand: (p.hand||[]).map(c=>c.id),
          deckN: (p.deck||[]).length,
          discardN: (p.discard||[]).length
        })),
        board: (state.board||[]).map(row => row.map(cell => {
          const u = cell?.unit;
          return u ? {o:u.owner,h:u.hp,a:u.atk,f:u.facing,t:u.tplId} : null;
        }))
      };
      return JSON.stringify(compact);
    } catch { return '';}
  }

  let lastDigest = '';
  let pending = false;
  function schedulePush(reason='auto', {force=false}={}){
    const online = (typeof NET_ON === 'function') ? NET_ON() : false;
    if (!online || !gameState) return;
    if (APPLYING && !force) return;              // не эхоим полученный снапшот
    // Не пушим во время анимаций, если не forced
    if (!force && (manaGainActive || drawAnimationActive || splashActive)) return;
    const myTurn = (typeof gameState.active === 'number') && (gameState.active === MY_SEAT);
    if (!force && !myTurn) return;               // только активный игрок пушит
    if (force) {
      // немедленная отправка, игнорируя pending
      try {
        // Версионируем состояние: защитимся от устаревших снапшотов, приходящих чуть позже
        gameState.__ver = (Number(gameState.__ver) || 0) + 1;
        try { window.__LAST_SENT_VER = gameState.__ver; } catch {}
        socket.emit('pushState', { state: gameState, reason });
      } catch{}
      lastDigest = digest(gameState);
      pending = false;
      return;
    }
    if (pending) return;
    pending = true;
    requestAnimationFrame(()=>{
      pending = false;
      try {
        gameState.__ver = (Number(gameState.__ver) || 0) + 1;
        try { window.__LAST_SENT_VER = gameState.__ver; } catch {}
        socket.emit('pushState', { state: gameState, reason });
      } catch{}
      lastDigest = digest(gameState);
    });
  }
  // Экспортируем наружу, чтобы ранние функции (например, endTurn) могли вызвать schedulePush
  try { window.schedulePush = schedulePush; } catch {}

  // Периодическая отправка при любом изменении (подстраховка, если обёртка не сработала)
  setInterval(()=>{
    const online = (typeof NET_ON === 'function') ? NET_ON() : false;
    if (!online || !gameState) return;
    // пушит только тот, у кого сейчас ХОД (чтобы оба могли делать свои ходы)
    const myTurn = (typeof gameState.active === 'number') && (gameState.active === MY_SEAT);
    if (!myTurn) return;
    const d = digest(gameState);
    if (d && d !== lastDigest) schedulePush('digest');
  }, 250);

  // --- RECEIVING: применяем снапшот и перерисовываем ---
  socket.on('state', async (state)=>{
    if (!state) return;
    const prev = APPLYING ? null : (gameState ? JSON.parse(JSON.stringify(gameState)) : null);
    // Robust previous snapshot even if prev is null due to concurrent APPLYING
    let __lastTurnSeen = 0;
    try { __lastTurnSeen = (typeof window !== 'undefined' && typeof window.__lastTurnSeen === 'number') ? window.__lastTurnSeen : (gameState?.turn || 0); } catch {}
    const __hadNewTurn = (typeof state.turn === 'number') && (state.turn > (__lastTurnSeen || 0));
    let __lastManaSeen = (typeof window !== 'undefined' && window.__lastManaSeen && Array.isArray(window.__lastManaSeen)) ? window.__lastManaSeen.slice() : [0,0];
    try {
      if (!__lastManaSeen || __lastManaSeen.length < 2) __lastManaSeen = [0,0];
      if (gameState && gameState.players) {
        __lastManaSeen[0] = Number(gameState.players[0]?.mana || __lastManaSeen[0] || 0);
        __lastManaSeen[1] = Number(gameState.players[1]?.mana || __lastManaSeen[1] || 0);
      }
    } catch {}
    // Защита от поздних устаревших снапшотов: принимаем только если версия не меньше текущей
    try {
      const incomingVer = Number(state.__ver) || 0;
      const currentVer = Number(gameState && gameState.__ver) || 0;
      if (incomingVer <= currentVer && !((Number(state?.turn||0)) > (Number(gameState?.turn||0)))) {
        // проигнорируем устаревший снапшот
        return;
      }
    } catch {}
    
    // WebSocket анимации отключены, флаги не используются
    
    // Pre-clamp incoming turn mana to avoid early +2 before splash/animation
    try {
      const hadNewTurn = !!(prev && typeof prev.turn === 'number' && typeof state.turn === 'number' && state.turn > prev.turn);
      if (hadNewTurn) {
        const owner = (typeof state.active === 'number') ? state.active : (prev?.active ?? 0);
        const beforeM = Math.max(0, Number(prev?.players?.[owner]?.mana ?? 0));
        const afterM = Math.max(0, Number(state?.players?.[owner]?.mana ?? beforeM));
        if (afterM > beforeM) {
          try { if (state.players && state.players[owner]) state.players[owner]._beforeMana = beforeM; } catch {}
          try {
            if (!PENDING_MANA_ANIM && !manaGainActive) {
              PENDING_MANA_ANIM = window.PENDING_MANA_ANIM = {
                ownerIndex: owner,
                startIdx: Math.max(0, Math.min(9, beforeM)),
                endIdx: Math.max(-1, Math.min(9, afterM - 1))
              };
            }
          } catch {}
        }
      }
    } catch {}

    APPLYING = true;
    try {
      gameState = state;
      try { window.gameState = state; } catch {}
      lastDigest = digest(state);
      // Immediately reflect active seat and mana bars before any animations
        const leftSide = document.getElementById('left-side');
        const rightSide = document.getElementById('right-side');
        const t0 = document.getElementById('player-title-0');
        const t1 = document.getElementById('player-title-1');
        if (leftSide && rightSide && t0 && t1 && typeof gameState.active === 'number') {
          leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
          rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
          t0.classList.remove('title-pulse');
          t1.classList.remove('title-pulse');
          if (gameState.active === 0) {
            leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
            t0.classList.add('title-pulse');
          } else {
            rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
            t1.classList.add('title-pulse');
          }
        }
      try { updateIndicator(); } catch {}
      try { updateInputLock(); } catch {}
      // Сначала переcоберём доску/мета-объекты, затем юниты и UI (исправляет мерцание рамок)
      try{ createBoard && createBoard(); }catch{}
      try{ createMetaObjects && createMetaObjects(); }catch{}
      // Defer unit rebuild during remote lunge animation to avoid canceling the push
      try {
        const now = Date.now();
        const until = (typeof window !== 'undefined' && typeof window.__REMOTE_BATTLE_ANIM_UNTIL === 'number') ? window.__REMOTE_BATTLE_ANIM_UNTIL : __REMOTE_BATTLE_ANIM_UNTIL;
        if (until && now < until) {
          const delay = Math.min(900, Math.max(30, until - now + 20));
          if (window.__deferredUnitsTimer) { try { clearTimeout(window.__deferredUnitsTimer); } catch {} }
          window.__deferredUnitsTimer = setTimeout(()=>{ try { updateUnits(); } catch {} }, delay);
        } else {
          updateUnits();
        }
      } catch { updateUnits(); }
      // Обрабатываем отложенные WebSocket анимации
      try { flushPendingBattleQueues && flushPendingBattleQueues(); } catch {}
      try { if (prev) playDeltaAnimations(prev, state); } catch {}
      // Периодически пробуем воспроизвести отложенные анимации
      try {
        if (typeof window !== 'undefined') {
          if (window.__pendingBattleFlushTimer) clearInterval(window.__pendingBattleFlushTimer);
          window.__pendingBattleFlushTimer = setInterval(()=>{
            try { flushPendingBattleQueues && flushPendingBattleQueues(); } catch {}
          }, 120);
          setTimeout(()=>{ try { if (window.__pendingBattleFlushTimer) clearInterval(window.__pendingBattleFlushTimer); } catch {} }, 2500);
        }
      } catch {}
      // Если пришёл новый ход, заранее блокируем отображение новых орбов маны,
      // чтобы первая перерисовка UI не показывала их до вспышки
      try {
        const isNewTurnEarly = !!(prev && typeof prev.turn === 'number' && typeof state.turn === 'number' && state.turn > prev.turn);
        if (isNewTurnEarly) {
          const ownerEarly = (typeof state.active === 'number') ? state.active : (gameState?.active ?? 0);
          const beforeMEarly = (prev?.players?.[ownerEarly]?.mana ?? 0);
          const afterMEarly = (state?.players?.[ownerEarly]?.mana ?? 0);
          // Только устанавливаем PENDING_MANA_ANIM если нет текущей анимации маны
          if (!PENDING_MANA_ANIM && !manaGainActive) {
            PENDING_MANA_ANIM = window.PENDING_MANA_ANIM = { ownerIndex: ownerEarly, startIdx: Math.max(0, Math.min(9, beforeMEarly)), endIdx: Math.max(-1, Math.min(9, afterMEarly - 1)) };
            try { if (typeof window !== 'undefined' && window.gameState && window.gameState.players && window.gameState.players[ownerEarly]) { window.gameState.players[ownerEarly]._beforeMana = beforeMEarly; } } catch {}
          }
        }
      } catch {}
      // Guard: ensure start-of-turn +2 does not render before animation
      try {
        const __hadNewTurn = !!(typeof state.turn === 'number' && state.turn > (__lastTurnSeen || 0));
        if (__hadNewTurn && !PENDING_MANA_ANIM && !manaGainActive) {
          const __owner = (typeof state.active === 'number') ? state.active : (gameState?.active ?? 0);
          const __beforeM = Math.max(0, Number((__lastManaSeen && __lastManaSeen[__owner]) ?? 0));
          const __afterM = Math.max(0, Number(state?.players?.[__owner]?.mana ?? __beforeM));
          if (__afterM > __beforeM) {
            PENDING_MANA_ANIM = window.PENDING_MANA_ANIM = {
              ownerIndex: __owner,
              startIdx: Math.max(0, Math.min(9, __beforeM)),
              endIdx: Math.max(-1, Math.min(9, __afterM - 1))
            };
          }
        }
      } catch {}
      try { updateUI(); }catch{}
      // Если начался новый ход — синхронизируем порядок анимаций как в офлайне:
      // 1) Заставка хода с корректным заголовком, 2) Анимация маны, 3) Добор
      // Упрощенная и надежная система обработки нового хода
      try {
        const isNewTurn = (typeof state.turn === 'number') && (state.turn > ((prev && typeof prev.turn === 'number') ? prev.turn : (__lastTurnSeen || 0)));
        if (isNewTurn) {
          console.log(`[NETWORK] Processing new turn ${state.turn} (prev: ${prev?.turn || 'none'})`);
          
          // Ensure turn splash is visible (robust, idempotent)
          try {
            if (window.__ui && window.__ui.banner) {
              const b = window.__ui.banner;
              if (typeof b.ensureTurnSplashVisible === 'function') {
                await b.ensureTurnSplashVisible(3, state.turn);
              } else if (typeof b.forceTurnSplashWithRetry === 'function') {
                await b.forceTurnSplashWithRetry(3, state.turn);
              }
            } else if (typeof forceTurnSplashWithRetry === 'function') {
              await forceTurnSplashWithRetry(3);
            }
          } catch (e) {
            console.error('[NETWORK] Turn splash failed:', e);
          }
          
          // 1. Показываем заставку хода (если еще не показывали этот ход)
          if (lastSplashTurnShown < state.turn) {
            console.log(`[NETWORK] Showing turn splash for turn ${state.turn}`);
            try {
              if (window.__ui && window.__ui.banner) {
                const b = window.__ui.banner;
                if (typeof b.ensureTurnSplashVisible === 'function') {
                  await b.ensureTurnSplashVisible(3, state.turn);
                } else if (typeof b.forceTurnSplashWithRetry === 'function') {
                  await b.forceTurnSplashWithRetry(3, state.turn);
                }
              }
              lastSplashTurnShown = state.turn;
            } catch (e) {
              console.error('[NETWORK] Turn splash failed:', e);
            }
          }
          
          // 2. Анимация маны активного игрока
          const owner = (typeof state.active === 'number') ? state.active : 0;
          const beforeM = Math.max(0, (prev?.players?.[owner]?.mana ?? 0));
          const afterM = Math.max(0, (state?.players?.[owner]?.mana ?? 0));
          
          // Expose _beforeMana for UI clamping until animation completes
          try { if (typeof window !== 'undefined' && window.gameState && window.gameState.players && window.gameState.players[owner]) { window.gameState.players[owner]._beforeMana = beforeM; } } catch {}

          if (afterM > beforeM) {
            console.log(`[NETWORK] Animating mana for player ${owner}: ${beforeM} -> ${afterM}`);
            try {
              if (window.__ui && window.__ui.mana && typeof window.__ui.mana.animateTurnManaGain === 'function') {
                await window.__ui.mana.animateTurnManaGain(owner, beforeM, afterM, 1500);
              }
            } catch (e) {
              console.error('[NETWORK] Mana animation failed:', e);
            }
          }
        }
      } catch (e) {
        console.error('[NETWORK] Error processing new turn:', e);
      }
      // Анимация добора у приёмника (только для своей руки)
      try {
        const mySeat = (typeof window !== 'undefined' && typeof window.MY_SEAT === 'number') ? window.MY_SEAT : null;
        if (mySeat !== null && prev && prev.players && state.players) {
          const prevHand = (prev.players[mySeat]?.hand) || [];
          const nextHand = (state.players[mySeat]?.hand) || [];
          const delta = Math.max(0, nextHand.length - prevHand.length);
          if (delta > 0) {
            // Спрячем последние delta карт на время анимации
            pendingDrawCount = delta; updateHand();
            // Определим какие именно шаблоны анимировать — возьмём последние delta карт
            const newCards = nextHand.slice(-delta);
            for (let i = 0; i < newCards.length; i++) {
              const tpl = newCards[i];
              await animateDrawnCardToHand(tpl);
              // По одной открываем карту в руке
              pendingDrawCount = Math.max(0, pendingDrawCount - 1);
              updateHand();
            }
          } else {
            updateHand();
          }
        } else {
          updateHand();
        }
      } catch { updateHand(); }
    __endTurnInProgress = false;
    updateIndicator();
    updateInputLock();
      // Persist last seen turn/mana for robust next-frame animations
      try {
        if (typeof window !== 'undefined') {
          window.__lastTurnSeen = Number(state.turn || 0);
          if (!window.__lastManaSeen) window.__lastManaSeen = [0,0];
          try { window.__lastManaSeen[0] = Number(state.players?.[0]?.mana || 0); } catch {}
          try { window.__lastManaSeen[1] = Number(state.players?.[1]?.mana || 0); } catch {}
        }
      } catch {}
    } finally {
      APPLYING=false;
      __endTurnInProgress = false; refreshInputLockUI();
    }
  });

  // Явный сигнал о смене хода (ускоряет разблокировку у оппонента в заанимированных кейсах)
  socket.on('turnSwitched', ({ activeSeat })=>{
    try {
      if (typeof activeSeat === 'number') {
        if (!gameState) gameState = {};
        gameState.active = activeSeat;
      }
    } catch {}
    try {
      const leftSide = document.getElementById('left-side');
      const rightSide = document.getElementById('right-side');
      const t0 = document.getElementById('player-title-0');
      const t1 = document.getElementById('player-title-1');
      if (leftSide && rightSide && t0 && t1 && typeof gameState.active === 'number') {
        leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
        rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.remove('active-player-panel'));
        t0.classList.remove('title-pulse');
        t1.classList.remove('title-pulse');
        if (gameState.active === 0) {
          leftSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
          t0.classList.add('title-pulse');
        } else {
          rightSide.querySelectorAll('.overlay-panel').forEach(el => el.classList.add('active-player-panel'));
          t1.classList.add('title-pulse');
        }
      }
    } catch {}
    updateIndicator();
    updateInputLock();
    // Show splash reliably; state event will drive full UI/mana sync
    try {
      if (typeof forceTurnSplashWithRetry === 'function') forceTurnSplashWithRetry(2);
    } catch {}
  });

  // ===== 9) Battle animation sync =====
  // Small guard to delay unit rebuild during remote lunge
  let __REMOTE_BATTLE_ANIM_UNTIL = 0; try { window.__REMOTE_BATTLE_ANIM_UNTIL = __REMOTE_BATTLE_ANIM_UNTIL; } catch {}

  function tryPlayBattleAnim(attacker, targets){
    try {
      if (!attacker || !Array.isArray(targets) || targets.length===0) return false;
      const aMesh = unitMeshes.find(m => m.userData.row === attacker.r && m.userData.col === attacker.c);
      const first = targets[0];
      if (!aMesh || !tileMeshes?.[first.r]?.[first.c]) return false;
      const targetPos = tileMeshes[first.r][first.c].position;
      const dir = new THREE.Vector3().subVectors(targetPos, aMesh.position).normalize();
      const push = { x: dir.x * 0.6, z: dir.z * 0.6 };
      // Wrap target mesh into a transient group to ensure movement is visible
      const parent = aMesh.parent; if (!parent) return false;
      const fromPos = aMesh.position.clone();
      const fromRot = aMesh.rotation.clone();
      const wrapper = new THREE.Group();
      wrapper.position.copy(fromPos); wrapper.rotation.copy(fromRot);
      try { parent.add(wrapper); parent.remove(aMesh); aMesh.position.set(0,0,0); aMesh.rotation.set(0,0,0); wrapper.add(aMesh); } catch {}
      const toPos = wrapper.position.clone(); toPos.x += push.x; toPos.z += push.z;
      const tl = gsap.timeline({ onComplete: () => {
        try { parent.add(aMesh); parent.remove(wrapper); aMesh.position.copy(fromPos); aMesh.rotation.copy(fromRot); } catch {}
      }});
      tl.to(wrapper.position, { x: toPos.x, z: toPos.z, duration: 0.22, ease: 'power2.out' })
        .to(wrapper.position, { x: fromPos.x, z: fromPos.z, duration: 0.30, ease: 'power2.inOut' });
      __REMOTE_BATTLE_ANIM_UNTIL = Date.now() + 720; try { window.__REMOTE_BATTLE_ANIM_UNTIL = __REMOTE_BATTLE_ANIM_UNTIL; } catch {}
      
      // Тряска цели и синхронный урон для неинициатора
      setTimeout(() => {
        try {
          for (const target of targets) {
            const tMesh = unitMeshes.find(m => m.userData.row === target.r && m.userData.col === target.c);
            if (tMesh && typeof target.dmg === 'number' && target.dmg > 0) {
              window.__fx?.shakeMesh(tMesh, 6, 0.12);
              try { window.__fx?.cancelPendingHpPopup(`${target.r},${target.c}`, -target.dmg); } catch {}
              try { window.__fx?.spawnDamageText(tMesh, `-${target.dmg}`, '#ff5555'); } catch {}
              try {
                const key = `${target.r},${target.c}`;
                RECENT_REMOTE_DAMAGE.set(key, { delta: -target.dmg, ts: Date.now() });
              } catch {}
            }
          }
        } catch {}
      }, 420);
      
      return true;
    } catch { return false; }
  }
  socket.on('battleAnim', ({ attacker, targets, __id, bySeat }) => {
    console.log('[battleAnim] Received battle animation', { MY_SEAT, bySeat, attacker, targets: targets?.length });
    
    // Показываем анимацию всем игрокам КРОМЕ инициатора
    if (typeof MY_SEAT === 'number' && typeof bySeat === 'number' && MY_SEAT === bySeat) {
      console.log('[battleAnim] Skipping animation for initiator');
      return;
    }
    
    // Defer during state apply to avoid losing animation due to re-render
    if (typeof APPLYING !== 'undefined' && APPLYING) {
      try { PENDING_BATTLE_ANIMS.push({ attacker, targets, ts: Date.now(), id: __id }); } catch {}
      return;
    }
    
    const success = tryPlayBattleAnim(attacker, targets);
    console.log('[battleAnim] Animation result:', success);
    if (!success) {
      // Отложим анимацию
      PENDING_BATTLE_ANIMS.push({ attacker, targets, ts: Date.now(), id: __id });
    }
  });
  // Визуальная поддержка: если пришло событие ритуала у оппонента — мягко отобразим +2 маны у него
  socket.on('ritualResolve', ({ kind, by, card, consumed, consumedIdx, spellIdx, consumedCard, spellCard }) => {
    try {
      if (kind === 'HOLY_FEAST' && typeof by === 'number') {
        try { if (typeof window !== 'undefined') window.__HF_ACK = true; } catch {}
        // Полностью сбрасываем все состояния Holy Feast
        try { hidePrompt(); } catch {}
        try { pendingDiscardSelection = null; } catch {}
        try { pendingRitualSpellHandIndex = null; } catch {}
        try { pendingRitualSpellCard = null; } catch {}
        try { PENDING_HIDE_HAND_CARDS = []; } catch {}
        try { resetCardSelection(); } catch {}
        // Убираем карту-спелл с поля если она там есть
        try { 
          if (pendingRitualBoardMesh) { 
            window.__fx?.dissolveAndAsh(pendingRitualBoardMesh, new THREE.Vector3(0,0.6,0), 0.9);
            setTimeout(()=>{ 
              try { pendingRitualBoardMesh.parent.remove(pendingRitualBoardMesh); } catch {} 
              pendingRitualBoardMesh = null; 
            }, 950); 
          } 
        } catch {}
        // Показать вспышку +2 маны у панели by (только визуально; фактическое значение придёт со снапшотом)
        const barEl = document.getElementById(`mana-display-${by}`);
        if (barEl) {
          const rect = barEl.getBoundingClientRect();
          const center = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
          // Две искры в панель — символически
          animateManaGainFromWorld(new THREE.Vector3(0,0,0), by, true);
          setTimeout(()=> animateManaGainFromWorld(new THREE.Vector3(0,0,0), by, true), 120);
        }
        // Принудительно обновляем UI для полного сброса состояний
        try { updateHand(); } catch {}
        try { updateUI(); } catch {}
      }
    } catch {}
  });

  // Доп. синхронизация: контратака (выпады контратакующих и удар по атакующему)
  function tryPlayRetaliation(attacker, retaliators, total){
    try {
      if (!attacker || !Array.isArray(retaliators)) return false;
      const aMesh = unitMeshes.find(m => m.userData.row === attacker.r && m.userData.col === attacker.c);
      if (!aMesh) return false;
      let maxDur = 0;
      for (const rrObj of retaliators) {
        const rMesh = unitMeshes.find(m => m.userData.row === rrObj.r && m.userData.col === rrObj.c);
        if (!rMesh) continue;
        const dir2 = new THREE.Vector3().subVectors(aMesh.position, rMesh.position).normalize();
        const push2 = { x: dir2.x * 0.6, z: dir2.z * 0.6 };
        const tl2 = gsap.timeline();
        tl2.to(rMesh.position, { x: `+=${push2.x}`, z: `+=${push2.z}`, duration: 0.22, ease: 'power2.out' })
           .to(rMesh.position, { x: `-=${push2.x}`, z: `-=${push2.z}`, duration: 0.30, ease: 'power2.inOut' });
        maxDur = Math.max(maxDur, 0.52);
      }
      if (typeof total === 'number' && total > 0) {
        setTimeout(() => {
          const aLive = unitMeshes.find(m => m.userData.row === attacker.r && m.userData.col === attacker.c) || aMesh;
          if (aLive) {
            window.__fx?.shakeMesh(aLive, 6, 0.14);
            try { window.__fx?.cancelPendingHpPopup(`${attacker.r},${attacker.c}`, -total); } catch {}
            try { window.__fx?.spawnDamageText(aLive, `-${total}`, '#ffd166'); } catch {}
            try {
              const key = `${attacker.r},${attacker.c}`;
              RECENT_REMOTE_DAMAGE.set(key, { delta: -total, ts: Date.now() });
            } catch {}
          }
        }, Math.max(0, maxDur * 1000 - 10));
      }
      return true;
    } catch { return false; }
  }
  socket.on('battleRetaliation', ({ attacker, retaliators, total, __id, bySeat }) => {
    console.log('[battleRetaliation] Received retaliation animation', { MY_SEAT, bySeat, attacker, retaliators: retaliators?.length, total });
    
    // Показываем анимацию всем игрокам КРОМЕ инициатора
    if (typeof MY_SEAT === 'number' && typeof bySeat === 'number' && MY_SEAT === bySeat) {
      console.log('[battleRetaliation] Skipping animation for initiator');
      return;
    }
    
    const success = tryPlayRetaliation(attacker, retaliators, total);
    console.log('[battleRetaliation] Animation result:', success);
    if (!success) {
      PENDING_RETALIATIONS.push({ attacker, retaliators, total, ts: Date.now(), id: __id });
    }
  });

  function flushPendingBattleQueues(){
    try {
      if (PENDING_BATTLE_ANIMS.length) {
        PENDING_BATTLE_ANIMS = PENDING_BATTLE_ANIMS.filter(ev => !tryPlayBattleAnim(ev.attacker, ev.targets));
      }
      if (PENDING_RETALIATIONS.length) {
        PENDING_RETALIATIONS = PENDING_RETALIATIONS.filter(ev => !tryPlayRetaliation(ev.attacker, ev.retaliators, ev.total));
      }
    } catch {}
  }

  // ===== 10) Tile crossfade sync =====
  socket.on('tileCrossfade', ({ r, c, prev, next }) => {
    try {
      const tile = tileMeshes?.[r]?.[c]; if (!tile) return;
      window.__fx?.dissolveTileCrossfade(tile, getTileMaterial(prev), getTileMaterial(next), 0.9);
    } catch {}
  });

  // ===== 5) Queue / start =====
  function onFindMatchClick(){ 
    console.log('[QUEUE] Attempting to join queue, socket connected:', socket.connected);
    showQueueModal(); 
    try { 
      (window.socket || socket).emit('joinQueue'); 
      (window.socket || socket).emit('debugLog', { event: 'joinQueue_sent', connected: socket.connected });
    } catch(err) {
      console.error('[QUEUE] Error joining queue:', err);
    }
  }
  socket.on('matchFound', ({ matchId, seat })=>{
    hideQueueModal();
    console.log('[MATCH] Match found, setting MY_SEAT to:', seat, 'matchId:', matchId);
    // Логирование для отладки
    try { (window.socket || socket).emit('debugLog', { event: 'matchFound_received', seat, matchId }); } catch {}
    
    // Полный сброс локального состояния предыдущего матча перед стартом нового
    try { if (window.__pendingBattleFlushTimer) { clearInterval(window.__pendingBattleFlushTimer); window.__pendingBattleFlushTimer = null; } } catch {}
    try { PENDING_BATTLE_ANIMS = []; PENDING_RETALIATIONS = []; } catch {}
    try { PENDING_MANA_ANIM = window.PENDING_MANA_ANIM = null; PENDING_MANA_BLOCK = [0,0]; } catch {}
    try { pendingDrawCount = 0; pendingRitualSpellHandIndex = null; pendingRitualSpellCard = null; } catch {}
    try { lastDigest = ''; } catch {}
    APPLYING = false;
    gameState = null;
    MY_SEAT = seat; NET_ACTIVE = true;
    try { window.MY_SEAT = seat; } catch {}
    console.log('[MATCH] MY_SEAT set to:', MY_SEAT, 'NET_ACTIVE:', NET_ACTIVE);
    updateIndicator(); updateInputLock();
    showStartCountdown(seat, 3);
  });

  async function onCountdownFinished(seat){
    if (seat===0){
      try{ typeof initGame==='function' && await initGame(); }catch{}
      schedulePush('init-snapshot', {force:true}); // гарантированный первый снапшот
    } else {
      try { (window.socket || socket).emit('requestState'); } catch {}
    }
  }

  socket.on('opponentLeft', ()=>{
    console.log('[MATCH] Opponent left, MY_SEAT:', MY_SEAT);
    NET_ACTIVE=false; updateIndicator(); updateInputLock();
    // Показываем победу оставшемуся в игре игроку
    showVictoryModal({ reason: 'opponentLeft', winnerSeat: MY_SEAT });
    try { if (queueModal) hideQueueModal(); } catch {}
    try { hideStartCountdown(); } catch {}
  });

  // ===== 6) Online indicator + whose turn =====
  const ind = document.createElement('div');
  ind.className='mp-ind';
  ind.innerHTML = `<span class="mp-dot" id="mp-dot"></span>
                   <span id="mp-net">offline</span>
                   <span class="mp-tag" id="mp-seat">—</span>
                   <span class="mp-turn" id="mp-turn"></span>`;
  document.body.appendChild(ind);

  // ===== 6.1) Debug log UI =====
  (function mountDebugLog(){
    try {
      if (document.getElementById('debug-log-btn')) return;
      // Размещаем отдельно слева над индикатором, чтобы не перекрывать «Сдаться»
      let host = document.getElementById('mp-debug');
      if (!host) { host = document.createElement('div'); host.id='mp-debug'; host.style.position='fixed'; host.style.left='12px'; host.style.bottom='52px'; host.style.zIndex='9998'; document.body.appendChild(host); }
      const btn = document.createElement('button'); btn.id='debug-log-btn'; btn.className='mp-btn'; btn.textContent='Download log';
      btn.addEventListener('click', async ()=>{
        try {
          const res = await fetch(`${SERVER_URL}/debug-log?n=2000`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href=url; a.download = `eog-log-${Date.now()}.json`; a.click();
          setTimeout(()=>URL.revokeObjectURL(url), 2000);
        } catch(err){
          console.error('Download log error', err);
          showNotification('Could not download log', 'error');
        }
      });
      host.appendChild(btn);
    } catch {}
  })();

  // Получение версии билда (в приоритете — коммит клиентского репозитория из GitHub API)
  (async function fetchBuildVersion(){
    const el = document.getElementById('build-version');
    if (!el) return;
    // 1) Пробуем GitHub API по window.CLIENT_REPO = { owner, repo, ref? }
    try {
      let cfg = (typeof window !== 'undefined' && window.CLIENT_REPO) ? window.CLIENT_REPO : null;
      // Пробуем прочитать из <meta name="client-repo" content="owner/repo@ref">, либо из localStorage
      if (!cfg) {
        try {
          const meta = document.querySelector('meta[name="client-repo"]');
          const val = (meta && meta.getAttribute('content')) || (localStorage.getItem('CLIENT_REPO') || '');
          if (val) {
            // Форматы: owner/repo@ref | owner/repo
            const [full, ref] = String(val).split('@');
            const [owner, repo] = full.split('/');
            if (owner && repo) cfg = { owner, repo, ref };
          }
        } catch {}
      }
      if (cfg && cfg.owner && cfg.repo) {
        const ref = encodeURIComponent(cfg.ref || 'main');
        const headers = {};
        // Необязательный токен GitHub для повышенного лимита (например, положить в localStorage.GH_TOKEN)
        try { const t = localStorage.getItem('GH_TOKEN'); if (t) headers['Authorization'] = `Bearer ${t}`; } catch {}
        const gh = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${ref}`, { headers });
        if (gh.ok) {
          const data = await gh.json();
          const shaShort = (data.sha || '').slice(0, 7);
          let msg = (data.commit && data.commit.message) ? String(data.commit.message).trim() : '';
          if (msg) { const parts = msg.split(/\s+/).slice(0, 7); msg = parts.join(' '); }
          el.textContent = shaShort ? `${shaShort}${msg ? ' — ' + msg : ''}` : (msg || '');
          return;
        }
      }
    } catch {}
    // 2) Фолбэк: серверный /build (покажет версию именно серверного репозитория)
    try {
      const res = await fetch('/build');
      if (!res.ok) return;
      const d = await res.json();
      const shaShort = (d.sha || '').slice(0, 7);
      let msg = (d.message || '').trim();
      if (msg) { const parts = msg.split(/\s+/).slice(0, 7); msg = parts.join(' '); }
      el.textContent = shaShort ? `${shaShort}${msg ? ' — ' + msg : ''}` : (msg || '');
    } catch {}
  })();

  function updateIndicator(){
    const dot=document.getElementById('mp-dot');
    const net=document.getElementById('mp-net');
    const seat=document.getElementById('mp-seat');
    const turn=document.getElementById('mp-turn');
    if (!dot || !net || !seat || !turn) return;

    const online = socket.connected && (typeof NET_ON === 'function' ? NET_ON() : false);
    dot.classList.toggle('on', online);
    net.textContent = online ? 'online' : 'offline';
    seat.textContent = (MY_SEAT===0)?'Player 1':(MY_SEAT===1)?'Player 2':'—';

    if (gameState && (MY_SEAT===0 || MY_SEAT===1)){
      turn.textContent = (gameState.active===MY_SEAT) ? 'your turn' : 'opponent\'s turn';
    } else turn.textContent='';
  }
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to server');
    updateIndicator();
  });
  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected from server:', reason);
    updateIndicator();
  });
  socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
  });
  socket.on('matchFound', updateIndicator);
  setInterval(updateIndicator, 500);
  updateIndicator();

  // ===== 7) Input lock: когда не твой ход — блокируем клики по сцене =====
  const lock = document.createElement('div');
  lock.className = 'mp-lock';
  lock.innerHTML = `<div class="mp-card">Ход соперника…</div>`;
  document.body.appendChild(lock);

  function updateInputLock(){
    // Lock only when seat is known; otherwise do not block input
    if (!lock) return;
    const myKnown = (typeof MY_SEAT === 'number');
    const shouldLock = (typeof NET_ON === 'function' ? NET_ON() : false) &&
      gameState && myKnown && (gameState.active !== MY_SEAT);
    lock.classList.toggle('on', !!shouldLock);
  }

  try {
    if (typeof window !== 'undefined') {
      window.updateIndicator = updateIndicator;
      window.updateInputLock = updateInputLock;
    }
  } catch {}

  // Серверный таймер хода: только отображение и локальная анимация кнопки
  socket.on('turnTimer', ({ seconds, activeSeat })=>{
    try { window.__turnTimerSeconds = seconds; } catch {}
    try { if (gameState && typeof activeSeat === 'number') gameState.active = activeSeat; } catch {}
    try {
      if (window.__ui && window.__ui.turnTimer) {
        const tt = window.__ui.turnTimer.attach('end-turn-btn');
        tt.stop();
        tt.set(Math.max(0, Math.min(100, Number(seconds)||0)));
      }
    } catch {}

    try { updateIndicator(); } catch {}
    try { updateInputLock(); } catch {}
  });

  // ===== 8) Победа/поражение и меню после матча =====
  function showVictoryModal({ reason, winnerSeat }={}){
    console.log('[VICTORY] Showing victory modal', { reason, winnerSeat, MY_SEAT });
    hideQueueModal(); hideStartCountdown();
    const m = document.createElement('div');
    m.className = 'mp-modal';
    
    let title;
    if (reason === 'opponentLeft') {
      title = (winnerSeat === MY_SEAT) ? 'Victory! Opponent resigned' : 'Defeat! You disconnected';
    } else if (reason === 'resign') {
      title = (winnerSeat === MY_SEAT) ? 'Victory! Opponent resigned' : 'Defeat! You resigned';
    } else {
      title = (winnerSeat === MY_SEAT) ? 'Victory!' : 'Defeat';
    }
    m.innerHTML = `<div class="mp-card" style="min-width:320px">
      <div style="font-size:18px;margin-bottom:6px">${title}</div>
      <div class="mp-subtle" style="margin-bottom:12px">Match ended</div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button id="mp-offline" class="mp-btn">Offline game</button>
        <button id="mp-online" class="mp-btn">New online match</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#mp-offline').addEventListener('click', ()=>{ try{ location.reload(); }catch{} });
    m.querySelector('#mp-online').addEventListener('click', ()=>{
      try{ m.remove(); }catch{}
      NET_ACTIVE=false; updateIndicator(); updateInputLock();
      onFindMatchClick();
    });
  }

  // Кнопка «Сдаться» рядом с остальными
  function mountResignButton(){
    if (document.getElementById('resign-btn')) return;
    const host = document.querySelector('#corner-right .flex') || document.getElementById('corner-right');
    if (!host) return;
    const btn = document.createElement('button');
    btn.id = 'resign-btn';
    btn.className = 'overlay-panel px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 transition-colors';
    btn.textContent = 'Surrender';
    host.appendChild(btn);
    btn.addEventListener('click', ()=>{
      const confirmModal = document.createElement('div');
      confirmModal.className = 'mp-modal';
      confirmModal.innerHTML = `<div class="mp-card">
        <div>Вы уверены, что хотите сдаться?</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
          <button id="r-yes" class="mp-btn">Да</button>
          <button id="r-no" class="mp-btn">Нет</button>
        </div>
      </div>`;
      document.body.appendChild(confirmModal);
      confirmModal.querySelector('#r-no').addEventListener('click', ()=> confirmModal.remove());
      confirmModal.querySelector('#r-yes').addEventListener('click', ()=>{
        try { (window.socket || socket).emit('resign'); } catch {}
        try { confirmModal.remove(); } catch {}
      });
    });
  }
  mountResignButton();
  setInterval(mountResignButton, 1000);

  socket.on('matchEnded', ({ winnerSeat, reason })=>{
    // Полный сброс клиентского онлайнового состояния и комнаты перед показом модалки
    try { (window.socket || socket).emit('requestState'); } catch {}
    // ВАЖНО: сначала показываем модалку, используя актуальный MY_SEAT,
    // затем уже сбрасываем локальные флаги. Иначе у обоих будет "Поражение".
    showVictoryModal({ winnerSeat, reason: reason || 'resign' });
    NET_ACTIVE=false; APPLYING=false;
    // Сбрасываем seat после показа модалки
    MY_SEAT=null; try { window.MY_SEAT = null; } catch {}
    updateIndicator(); updateInputLock();
  });

  // Close MP bootstrap IIFE
})();
