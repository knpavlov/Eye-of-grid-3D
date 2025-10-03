import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import decksRouter from "./routes/decks.js";
import authRouter from "./routes/auth.js";
import { initDb, getDbError } from "./server/db.js";
import { ensureDeckTable, seedDecks, getDeckAccessibleByUser } from "./server/repositories/decksRepository.js";
import { ensureUserTable } from "./server/repositories/usersRepository.js";
import { resolveUserFromToken, toClientProfile } from "./server/services/sessionService.js";
import { DEFAULT_DECK_BLUEPRINTS } from "./src/core/defaultDecks.js";
import { capMana } from "./src/core/constants.js";
import { applyTurnStartManaEffects } from "./src/core/abilityHandlers/startPhase.js";
import { discardCardFromHand as discardCardFromHandLogic } from "./src/core/discardUtils.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/decks', decksRouter);
app.get("/", (req, res) => res.send("MP server alive"));
// ===== Debug log (in-memory) =====
let LOG = [];
const MAX_LOG = 2000;
function pushLog(entry){ try { LOG.push({ t: Date.now(), ...entry }); if (LOG.length > MAX_LOG) LOG.splice(0, LOG.length - MAX_LOG); } catch {} }
app.get('/debug-log', (req, res) => { try { const n = Math.max(1, Math.min(10000, Number(req.query.n) || 1000)); return res.json({ logs: LOG.slice(-n) }); } catch { return res.json({ logs: [] }); } });
app.post('/debug-log/clear', (req, res) => { try { LOG.length = 0; } catch{} res.json({ ok: true }); });
app.get('/queue-status', (req, res) => { 
  try { 
    return res.json({ 
      queueSize: queue.length, 
      queueSocketIds: queue.map(s => s.id), 
      activeMatches: matches.size,
      matchIds: Array.from(matches.keys())
    }); 
  } catch { 
    return res.json({ error: 'Failed to get queue status' }); 
  } 
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});
const PORT = process.env.PORT || 3001;

io.use(async (socket, next) => {
  try {
    const handshake = socket.handshake || {};
    const token = handshake.auth?.token
      || handshake.headers?.authorization
      || handshake.headers?.Authorization
      || handshake.query?.token
      || handshake.query?.authToken;
    const resolved = await resolveUserFromToken(token);
    if (resolved?.user) {
      socket.data.user = toClientProfile(resolved.user);
      socket.data.authToken = resolved.token;
    } else {
      socket.data.user = null;
      socket.data.authToken = null;
    }
  } catch (err) {
    console.warn('[server] Ошибка проверки токена сокета', err?.message || err);
    socket.data.user = null;
    socket.data.authToken = null;
  }
  next();
});

const dbReadyOnStart = await initDb();
if (dbReadyOnStart) {
  try {
    await ensureUserTable();
  } catch (err) {
    console.error('[server] Не удалось подготовить таблицу пользователей', err);
  }
  try {
    await ensureDeckTable();
    await seedDecks(DEFAULT_DECK_BLUEPRINTS);
  } catch (err) {
    console.error('[server] Не удалось подготовить таблицу колод', err);
  }
} else {
  const err = getDbError();
  console.warn('[server] Хранилище колод недоступно при запуске:', err?.message || err);
}

// очередь и активные матчи
const queue = [];
const matches = new Map(); // matchId -> { room, sockets:[s0,s1], lastState, lastVer, timerSeconds, timerId }

function pairIfPossible() {
  pushLog({ ev: 'pairIfPossible:start', queueSize: queue.length });

  // Проверяем готовность сокета к игре и фиксируем причину, если она есть
  const determineIssue = (socket) => {
    if (!socket) return 'MISSING';
    if (!socket.connected) return 'DISCONNECTED';
    if (!socket.data?.user) return 'AUTH_REQUIRED';
    if (!socket.data?.deckId) return 'DECK_REQUIRED';
    return null;
  };

  const requeueSockets = (socketsToReturn) => {
    if (!Array.isArray(socketsToReturn) || !socketsToReturn.length) return;
    for (let i = socketsToReturn.length - 1; i >= 0; i -= 1) {
      const sock = socketsToReturn[i];
      if (!sock?.connected) continue;
      if (queue.includes(sock)) continue;
      queue.unshift(sock);
      if (sock.data) sock.data.queueing = true;
      pushLog({ ev: 'pairIfPossible:requeue', sid: sock.id, queueSize: queue.length });
    }
  };

  const handleIssue = (socket, issue) => {
    if (!socket || !issue) return;
    if (socket.data) socket.data.queueing = false;
    if (issue === 'AUTH_REQUIRED') {
      try { socket.emit('authError', { reason: 'AUTH_REQUIRED' }); } catch {}
    } else if (issue === 'DECK_REQUIRED') {
      try { socket.emit('authError', { reason: 'DECK_REQUIRED' }); } catch {}
    }
  };

  while (queue.length >= 2) {
    const s0 = queue.shift();
    const s1 = queue.shift();

    pushLog({ ev: 'pairIfPossible:attempt', s0: s0?.id, s1: s1?.id, s0Connected: s0?.connected, s1Connected: s1?.connected });

    const sockets = [s0, s1];
    const issues = sockets.map(determineIssue);
    const ready = sockets.filter((sock, index) => !issues[index]);

    if (ready.length < sockets.length) {
      requeueSockets(ready);
      sockets.forEach((sock, index) => {
        const issue = issues[index];
        if (!issue) return;
        pushLog({ ev: 'pairIfPossible:skip', sid: sock?.id, issue });
        handleIssue(sock, issue);
      });
      continue;
    }

    const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const room = `room_${matchId}`;
    s0.join(room);
    s1.join(room);

    matches.set(matchId, {
      room,
      sockets:[s0,s1],
      players:[s0.data.user, s1.data.user],
      lastState:null,
      lastVer:0,
      timerSeconds: 100,
      timerId: null,
    });
    s0.data.matchId = matchId; s0.data.seat = 0;
    s1.data.matchId = matchId; s1.data.seat = 1;
    s0.data.queueing = false; s1.data.queueing = false;

    const deckIds = [s0.data.deckId, s1.data.deckId];
    const players = [s0.data.user, s1.data.user].map(user => ({
      id: user?.id,
      nickname: user?.nickname,
    }));
    s0.emit("matchFound", { matchId, seat: 0, decks: deckIds, players });
    s1.emit("matchFound", { matchId, seat: 1, decks: deckIds, players });
    pushLog({ ev: 'matchFound', matchId, sids: [s0.id, s1.id], deckIds });

    // Старт серверного таймера тиков (без авто-энда)
    const m = matches.get(matchId);
    if (m.timerId) clearInterval(m.timerId);
    m.timerId = setInterval(()=>{
      if (!matches.has(matchId)) { clearInterval(m.timerId); return; }
      const st = m.lastState;
      if (!st || typeof st.active !== 'number') return;
      const queue = Array.isArray(st.pendingDiscards) ? st.pendingDiscards : [];
      const hasPending = queue.some(req => req && req.remaining > 0);
      if (hasPending) {
        io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds ?? 100, activeSeat: st.active });
        return;
      }
      m.timerSeconds = Math.max(0, (m.timerSeconds ?? 100) - 1);
      io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds, activeSeat: st.active });
    }, 1000);
  }
  
  pushLog({ ev: 'pairIfPossible:end', queueSize: queue.length });
}

io.on("connection", (socket) => {
  pushLog({ ev: 'connect', sid: socket.id, transport: socket.conn.transport.name, remoteAddress: socket.conn.remoteAddress });
  socket.on('authenticate', async ({ token } = {}) => {
    const resolved = await resolveUserFromToken(token);
    if (resolved?.user) {
      socket.data.user = toClientProfile(resolved.user);
      socket.data.authToken = resolved.token;
      socket.emit('authState', { ok: true, user: socket.data.user });
      pushLog({ ev: 'auth:updated', sid: socket.id, userId: socket.data.user?.id });
    } else {
      socket.data.user = null;
      socket.data.authToken = null;
      socket.emit('authState', { ok: false });
      const idx = queue.indexOf(socket);
      if (idx >= 0) {
        queue.splice(idx, 1);
        pushLog({ ev: 'auth:clearedQueue', sid: socket.id });
      }
    }
  });
  // Клиентские произвольные заметки для отладки
  socket.on('debugLog', (payload = {}) => {
    try {
      const matchId = socket.data?.matchId;
      pushLog({ ev: 'client', sid: socket.id, matchId, ...payload });
    } catch {}
  });
  socket.on("joinQueue", async (payload = {}) => {
    if (!socket.data?.user) {
      socket.emit('authError', { reason: 'AUTH_REQUIRED' });
      pushLog({ ev: 'joinQueue:rejectedAuth', sid: socket.id });
      return;
    }
    const deckId = payload?.deckId;
    socket.data.deckId = deckId;
    pushLog({ ev: 'joinQueue:start', sid: socket.id, currentQueueSize: queue.length, deckId, userId: socket.data.user?.id });

    if (!deckId) {
      socket.emit('authError', { reason: 'DECK_REQUIRED' });
      return;
    }

    try {
      const deck = await getDeckAccessibleByUser(deckId, socket.data.user.id);
      if (!deck) {
        socket.emit('authError', { reason: 'DECK_NOT_FOUND' });
        pushLog({ ev: 'joinQueue:noDeck', sid: socket.id, deckId });
        return;
      }
      socket.data.deckId = deck.id;
      socket.data.deckOwnerId = deck.ownerId;
      socket.data.deckSnapshot = deck;
    } catch (err) {
      socket.emit('authError', { reason: 'DECK_LOOKUP_FAILED' });
      pushLog({ ev: 'joinQueue:lookupError', sid: socket.id, deckId, error: err?.message || err });
      return;
    }

    // если socket был в комнате завершённого матча — убедимся, что он вышел
    try {
      const matchId = socket.data.matchId;
      if (matchId && matches.has(matchId)) {
        const m = matches.get(matchId);
        socket.leave(m.room);
        pushLog({ ev: 'joinQueue:leftPrevMatch', sid: socket.id, matchId });
      }
    } catch {}
    
    // Очищаем состояние сокета
    socket.data.queueing = false;
    socket.data.matchId = undefined;
    socket.data.seat = undefined;
    
    // Удаляем из очереди если уже есть (очистка дубликатов)
    const existingIndex = queue.indexOf(socket);
    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
      pushLog({ ev: 'joinQueue:removedDuplicate', sid: socket.id });
    }
    
    // Добавляем в очередь
    queue.push(socket);
    socket.data.queueing = true;

    pushLog({ ev: 'joinQueue:added', sid: socket.id, newQueueSize: queue.length, deckId, userId: socket.data.user?.id });

    // Пытаемся создать матч
    pairIfPossible();
  });

  socket.on("leaveQueue", () => {
    const i = queue.indexOf(socket);
    if (i >= 0) {
      queue.splice(i, 1);
      socket.data.queueing = false;
      pushLog({ ev: 'leaveQueue', sid: socket.id, newQueueSize: queue.length });
    }
  });

  // активный игрок присылает актуальный gameState
  socket.on("pushState", ({ state, reason }) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    // Если это первый снапшот — принимаем и рассылаем
    if (!m.lastState) {
      m.lastState = state ?? null;
      try { m.lastVer = Number(state && state.__ver) || 0; } catch { m.lastVer = 0; }
      // сброс таймера на первый ход
      m.timerSeconds = 100;
      io.to(m.room).emit("state", m.lastState);
      io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds, activeSeat: m.lastState?.active ?? 0 });
      pushLog({ ev: 'pushState:first', sid: socket.id, matchId, reason: reason || '', ver: m.lastVer, active: m.lastState?.active, turn: m.lastState?.turn });
      return;
    }
    // Иначе принимаем только от игрока, чей seat совпадает с active в последнем состоянии
    try {
      const expectedSeat = typeof m.lastState?.active === 'number' ? m.lastState.active : null;
      if (expectedSeat === null) return;
      if (socket.data.seat !== expectedSeat) return;
    } catch { return; }
    // Отбрасываем устаревшие снапшоты: версия должна расти монотонно
    try {
      const incomingVer = Number(state && state.__ver) || 0;
      const lastVer = Number(m.lastVer) || 0;
      if (incomingVer < lastVer) return;
      m.lastVer = incomingVer;
    } catch {}
    // Accept client state but keep server-authoritative turn/active
    const incoming = state ?? m.lastState;
    const keptActive = m.lastState?.active;
    const keptTurn = m.lastState?.turn;
    m.lastState = { ...incoming, active: keptActive, turn: keptTurn };
    // Emit authoritative state only; turn changes happen via 'endTurn'
    // Emit authoritative state only; turn changes happen via endTurn
    io.to(m.room).emit("state", m.lastState);
  // Authoritative end-turn for online: server advances turn, adds mana, draws a card
    pushLog({ ev: 'pushState:applied', sid: socket.id, matchId, reason: reason || '', ver: m.lastVer, active: m.lastState?.active, turn: m.lastState?.turn });
  });
  socket.on("endTurn", () => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const st = m.lastState;
    if (!st) return;
    try {
      const expectedSeat = typeof st.active === 'number' ? st.active : null;
      if (expectedSeat === null) return;
      if (socket.data.seat !== expectedSeat) return; // not your turn
    } catch { return; }

    try {
      // Clear temp buffs owned by current active before switching
      for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) {
        const u = st.board?.[rr]?.[cc]?.unit; if (!u) continue;
        if (typeof u.tempAtkBuff === 'number' && u.tempBuffOwner === st.active) {
          delete u.tempAtkBuff; delete u.tempBuffOwner;
        }
      }
    } catch {}

    // Switch active and increment turn
    const prevActive = st.active;
    st.active = st.active === 0 ? 1 : 0;
    st.turn = (Number(st.turn) || 0) + 1;

    // Add +2 mana to new active и применяем эффекты начала хода
    let manaEffects = null;
    try {
      const pl = st.players?.[st.active];
      if (pl) {
        const before = Number(pl.mana) || 0;
        pl.mana = capMana(before + 2);
        manaEffects = applyTurnStartManaEffects(st, st.active) || { total: 0, entries: [] };
      }
    } catch (err) {
      pushLog({ ev: 'endTurn:manaError', matchId, err: err?.message || String(err) });
    }
    if (manaEffects && manaEffects.total > 0) {
      pushLog({ ev: 'endTurn:manaBonus', matchId, active: st.active, total: manaEffects.total, entries: manaEffects.entries });
    }

    // Draw one card for new active if any
    try {
      const pl = st.players?.[st.active];
      if (pl) {
        const deck = Array.isArray(pl.deck) ? pl.deck : [];
        const card = deck.shift();
        if (card) { pl.hand = Array.isArray(pl.hand) ? pl.hand : []; pl.hand.push(card); }
      }
    } catch {}

    // Bump version and persist
    try { st.__ver = (Number(st.__ver) || 0) + 1; } catch {}
    m.lastVer = Number(st.__ver) || (m.lastVer || 0);
    m.lastState = st;

    // Reset timer and notify
    // Reset timer and notify (emit state first)
    try { m.timerSeconds = 100; } catch {}
    try { io.to(m.room).emit("state", st); } catch {}
    try { io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds, activeSeat: st.active }); } catch {}
    try { io.to(m.room).emit('turnSwitched', { activeSeat: st.active }); } catch {}
    pushLog({ ev: 'endTurn:applied', matchId, bySeat: socket.data.seat, prevActive, active: st.active, turn: st.turn, ver: m.lastVer, manaNewActive: st.players?.[st.active]?.mana });
  });

  socket.on('forcedDiscardResolve', ({ requestId, target, handIdx, auto } = {}) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const st = m.lastState;
    if (!st) return;
    const queue = Array.isArray(st.pendingDiscards) ? st.pendingDiscards : [];
    const req = queue.find(entry => entry && entry.id === requestId);
    if (!req || req.remaining <= 0) {
      pushLog({ ev: 'forcedDiscardResolve:skip', matchId, reason: 'noRequest', requestId, target, seat: socket.data.seat });
      return;
    }
    const seat = socket.data.seat;
    if (seat !== req.target) {
      pushLog({ ev: 'forcedDiscardResolve:rejectSeat', matchId, requestId, seat: socket.data.seat, expected: req.target });
      return;
    }
    if (typeof target === 'number' && target !== req.target) {
      pushLog({ ev: 'forcedDiscardResolve:targetMismatch', matchId, requestId, seat: socket.data.seat, target, expected: req.target });
      return;
    }
    const player = st.players?.[req.target];
    if (!player) {
      pushLog({ ev: 'forcedDiscardResolve:noPlayer', matchId, requestId, seat: socket.data.seat });
      return;
    }
    const hand = Array.isArray(player.hand) ? player.hand : [];
    const beforeRemaining = req.remaining;
    let idx = typeof handIdx === 'number' ? Math.floor(handIdx) : -1;
    if (!hand.length) {
      idx = -1;
    } else if (idx < 0 || idx >= hand.length) {
      idx = Math.max(0, Math.min(hand.length - 1, idx));
    }
    let removed = null;
    if (idx >= 0 && hand.length) {
      removed = discardCardFromHandLogic(player, idx);
    }
    req.remaining = Math.max(0, (req.remaining || 1) - 1);
    if (req.remaining <= 0) {
      const pos = queue.indexOf(req);
      if (pos >= 0) queue.splice(pos, 1);
    }
    try { st.__ver = (Number(st.__ver) || 0) + 1; m.lastVer = st.__ver; } catch { m.lastVer = m.lastVer || 0; }
    m.lastState = st;
    try {
      io.to(m.room).emit('state', st);
    } catch {}
    pushLog({
      ev: 'forcedDiscardResolve:applied',
      matchId,
      requestId,
      seat,
      auto: !!auto,
      handIdx: idx,
      removed: removed?.id || removed?.tplId || null,
      beforeRemaining,
      afterRemaining: req.remaining,
      handSize: player.hand?.length || 0,
    });
  });

  socket.on("requestState", () => {
    const m = matches.get(socket.data.matchId);
    if (m?.lastState) socket.emit("state", m.lastState);
    if (m) socket.emit('turnTimer', { seconds: m.timerSeconds ?? 100, activeSeat: m.lastState?.active ?? 0 });
    pushLog({ ev: 'requestState', sid: socket.id, matchId: socket.data.matchId });
  });

  // синхронизация анимаций боя (выпады/контратаки)
  socket.on("battleAnim", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) {
      pushLog({ ev: 'battleAnim:reject', sid: socket.id, reason: 'noMatch', matchId });
      return;
    }
    const m = matches.get(matchId);
    // Маркируем событие id и строго ретранслируем обоим, включая инициатора (на клиенте фильтруем по active)
    try { if (!payload.__id) payload.__id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; } catch {}
    try { payload.bySeat = socket.data.seat; } catch {}
    
    // Логируем кому отправляем
    const roomSockets = Array.from(io.sockets.adapter.rooms.get(m.room) || []);
    pushLog({ ev: 'battleAnim:broadcast', sid: socket.id, matchId, room: m.room, roomSocketsCount: roomSockets.length, bySeat: socket.data.seat, attacker: payload?.attacker, targetsN: Array.isArray(payload?.targets)?payload.targets.length:0 });
    
    io.to(m.room).emit("battleAnim", payload);
    pushLog({ ev: 'battleAnim:sent', sid: socket.id, matchId, bySeat: socket.data.seat, attacker: payload?.attacker, targetsN: Array.isArray(payload?.targets)?payload.targets.length:0 });
  });

  // синхронизация контратаки (второй этап боя)
  socket.on("battleRetaliation", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    try { if (!payload.__id) payload.__id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; } catch {}
    try { payload.bySeat = socket.data.seat; } catch {}
    io.to(m.room).emit("battleRetaliation", payload);
    pushLog({ ev: 'battleRetaliation', sid: socket.id, matchId, bySeat: socket.data.seat, attacker: payload?.attacker, retaliatorsN: Array.isArray(payload?.retaliators)?payload.retaliators.length:0, total: payload?.total });
  });

  // синхронизация кроссфейда тайла (Fissures)
  socket.on("tileCrossfade", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    io.to(m.room).emit("tileCrossfade", payload);
    pushLog({ ev: 'tileCrossfade', sid: socket.id, matchId, r: payload?.r, c: payload?.c, prev: payload?.prev, next: payload?.next });
  });

  socket.on("manaDrainFx", (payload = {}) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    try { payload.bySeat = socket.data.seat; } catch {}
    io.to(m.room).emit("manaDrainFx", payload);
    pushLog({
      ev: 'manaDrainFx',
      sid: socket.id,
      matchId,
      amount: payload?.amount,
      from: payload?.from,
      drainOnly: payload?.drainOnly,
    });
  });

  // ритуальные спеллы (Holy Feast): подтверждение и визуальная синхронизация
  socket.on("ritualResolve", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    io.to(m.room).emit("ritualResolve", payload);
    pushLog({ ev: 'ritualResolve', sid: socket.id, matchId, payload });
  });

  // Авторитетная обработка Holy Feast (без доверия к полному снапшоту от клиента)
  socket.on("holyFeast", ({ seat, spellIdx, creatureIdx }) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    // Проверим право хода
    try {
      const expectedSeat = typeof m.lastState?.active === 'number' ? m.lastState.active : null;
      if (expectedSeat === null) { pushLog({ ev:'holyFeast:reject', matchId, reason:'noActive', seat, sid: socket.id }); return; }
      if (socket.data.seat !== expectedSeat) { pushLog({ ev:'holyFeast:reject', matchId, reason:'notTurnOwner', seat, sid: socket.id, expectedSeat, gotSeat: socket.data.seat }); return; }
      if (seat !== expectedSeat) { pushLog({ ev:'holyFeast:reject', matchId, reason:'seatMismatch', seat, sid: socket.id, expectedSeat }); return; }
    } catch { return; }
    const st = m.lastState;
    pushLog({ ev: 'holyFeast:req', sid: socket.id, matchId, seat, spellIdx, creatureIdx });
    try {
      const pl = st.players?.[seat];
      if (!pl) { pushLog({ ev:'holyFeast:reject', matchId, reason:'noPlayer', seat }); return; }
      const hand = pl.hand || [];
      if (typeof spellIdx !== 'number' || typeof creatureIdx !== 'number') { pushLog({ ev:'holyFeast:reject', matchId, reason:'badIndexesType', seat, spellIdx, creatureIdx, handN: hand.length }); return; }
      if (creatureIdx < 0 || creatureIdx >= hand.length) { pushLog({ ev:'holyFeast:reject', matchId, reason:'creatureIdxOutOfRange', seat, creatureIdx, handN: hand.length }); return; }
      if (spellIdx < 0 || spellIdx >= hand.length) { pushLog({ ev:'holyFeast:reject', matchId, reason:'spellIdxOutOfRange', seat, spellIdx, handN: hand.length }); return; }
      const spell = hand[spellIdx];
      const creature = hand[creatureIdx];
      if (!spell || spell.type !== 'SPELL' || spell.id !== 'SPELL_PARMTETIC_HOLY_FEAST') { pushLog({ ev:'holyFeast:reject', matchId, reason:'spellInvalid', seat, spell }); return; }
      if (!creature || creature.type !== 'UNIT') { pushLog({ ev:'holyFeast:reject', matchId, reason:'creatureInvalid', seat, creature }); return; }
      // Удаляем сначала больший индекс, чтобы не сдвинулся меньший
      const i1 = Math.max(spellIdx, creatureIdx);
      const i2 = Math.min(spellIdx, creatureIdx);
      const removed1 = hand.splice(i1, 1)[0];
      const removed2 = hand.splice(i2, 1)[0];
      const spellCard = removed1?.id === 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2;
      const creatureCard = removed1?.id !== 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2;
      try {
        pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : [];
        if (spellCard) pl.graveyard.push(spellCard);
        if (creatureCard) pl.graveyard.push(creatureCard);
      } catch {}
      // +2 маны
      const cap = (m) => Math.min(10, m);
      const beforeMana = (pl.mana || 0);
      pl.mana = cap(beforeMana + 2);
      // Обновим версию состояния и разошлём
      try { st.__ver = (Number(st.__ver) || 0) + 1; m.lastVer = st.__ver; } catch { m.lastVer = m.lastVer || 0; }
      // ЯВНО сообщим клиентам, что ритуал завершён — чтобы они закрыли локальные UI-состояния
      io.to(m.room).emit("ritualResolve", { kind: 'HOLY_FEAST', by: seat, consumedIdx: creatureIdx, spellIdx, consumedCard: removed1?.id !== 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1?.id : removed2?.id, spellCard: removed1?.id === 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1?.id : removed2?.id });
      io.to(m.room).emit("state", st);
      pushLog({ ev: 'holyFeast:applied', matchId, seat, manaBefore: beforeMana, newMana: pl.mana, removed: { spell: removed1?.id === 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1?.id : removed2?.id, creature: removed1?.id !== 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1?.id : removed2?.id }, discardN: (pl.discard||[]).length, graveyardN: (pl.graveyard||[]).length, ver: m.lastVer });
    } catch {}
  });

  // сдача матча
  socket.on("resign", () => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const loserSeat = socket.data.seat;
    const winnerSeat = loserSeat === 0 ? 1 : 0;
    io.to(m.room).emit("matchEnded", { winnerSeat, reason: 'resign' });
    pushLog({ ev: 'resign', matchId, loserSeat, winnerSeat });
    try { m.sockets.forEach(s => { if (s) { s.leave(m.room); s.data.matchId = undefined; s.data.seat = undefined; s.data.queueing = false; } }); } catch {}
    if (m.timerId) clearInterval(m.timerId);
    matches.delete(matchId);
  });

  socket.on("disconnect", () => {
    pushLog({ ev: 'disconnect', sid: socket.id, matchId: socket.data.matchId, queueing: socket.data.queueing });
    
    // Удаляем из очереди
    const i = queue.indexOf(socket);
    if (i >= 0) {
      queue.splice(i, 1);
      pushLog({ ev: 'disconnect:removedFromQueue', sid: socket.id, newQueueSize: queue.length });
    }
    
    const matchId = socket.data.matchId;
    if (matchId && matches.has(matchId)) {
      const m = matches.get(matchId);
      io.to(m.room).emit("opponentLeft");
      pushLog({ ev: 'disconnect:notifyOpponent', matchId, sid: socket.id });
      
      // очистить метаданные у обоих сокетов
      try { m.sockets.forEach(s => { if (s) { s.leave(m.room); s.data.matchId = undefined; s.data.seat = undefined; s.data.queueing = false; } }); } catch {}
      if (m.timerId) clearInterval(m.timerId);
      matches.delete(matchId);
      pushLog({ ev: 'disconnect:matchDeleted', matchId, sid: socket.id });
    }
  });
});

// Служебный эндпоинт версии билда (используются переменные окружения популярных PaaS)
app.get("/build", (req, res) => {
  try {
    const commitMessage = process.env.RAILWAY_GIT_COMMIT_MESSAGE || process.env.VERCEL_GIT_COMMIT_MESSAGE || process.env.COMMIT_MESSAGE || "";
    const commitSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || "";
    const branch = process.env.RAILWAY_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || "";
    res.json({
      message: commitMessage,
      sha: commitSha,
      branch,
      time: new Date().toISOString()
    });
  } catch (e) {
    res.json({ message: "", sha: "", branch: "", time: new Date().toISOString() });
  }
});

server.listen(PORT, () => console.log("MP server on", PORT));


