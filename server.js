import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());
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

// очередь и активные матчи
const queue = [];
const matches = new Map(); // matchId -> { room, sockets:[s0,s1], lastState, lastVer, timerSeconds, timerId }

function pairIfPossible() {
  pushLog({ ev: 'pairIfPossible:start', queueSize: queue.length });
  
  while (queue.length >= 2) {
    const s0 = queue.shift();
    const s1 = queue.shift();
    
    pushLog({ ev: 'pairIfPossible:attempt', s0: s0?.id, s1: s1?.id, s0Connected: s0?.connected, s1Connected: s1?.connected });
    
    if (!s0?.connected || !s1?.connected) {
      pushLog({ ev: 'pairIfPossible:skipDisconnected', s0: s0?.id, s1: s1?.id });
      continue;
    }

    const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const room = `room_${matchId}`;
    s0.join(room);
    s1.join(room);

    matches.set(matchId, { room, sockets:[s0,s1], lastState:null, lastVer:0, timerSeconds: 100, timerId: null });
    s0.data.matchId = matchId; s0.data.seat = 0;
    s1.data.matchId = matchId; s1.data.seat = 1;
    s0.data.queueing = false; s1.data.queueing = false;

    s0.emit("matchFound", { matchId, seat: 0 });
    s1.emit("matchFound", { matchId, seat: 1 });
    pushLog({ ev: 'matchFound', matchId, sids: [s0.id, s1.id] });

    // Старт серверного таймера тиков (без авто-энда)
    const m = matches.get(matchId);
    if (m.timerId) clearInterval(m.timerId);
    m.timerId = setInterval(()=>{
      if (!matches.has(matchId)) { clearInterval(m.timerId); return; }
      // если ещё нет состояния — подождём
      if (!m.lastState || typeof m.lastState.active !== 'number') return;
      m.timerSeconds = Math.max(0, (m.timerSeconds ?? 100) - 1);
      io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds, activeSeat: m.lastState.active });
    }, 1000);
  }
  
  pushLog({ ev: 'pairIfPossible:end', queueSize: queue.length });
}

io.on("connection", (socket) => {
  pushLog({ ev: 'connect', sid: socket.id, transport: socket.conn.transport.name, remoteAddress: socket.conn.remoteAddress });
  // Клиентские произвольные заметки для отладки
  socket.on('debugLog', (payload = {}) => {
    try {
      const matchId = socket.data?.matchId;
      pushLog({ ev: 'client', sid: socket.id, matchId, ...payload });
    } catch {}
  });
  socket.on("joinQueue", () => {
    pushLog({ ev: 'joinQueue:start', sid: socket.id, currentQueueSize: queue.length });
    
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
    
    pushLog({ ev: 'joinQueue:added', sid: socket.id, newQueueSize: queue.length });
    
    // Пытаемся создать матч
    pairIfPossible();
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
    const prevActive = m.lastState?.active;
    m.lastState = state ?? m.lastState;
    // Если активный игрок сменился — сбрасываем таймер
    try {
      if (typeof prevActive === 'number' && typeof m.lastState?.active === 'number' && prevActive !== m.lastState.active) {
        m.timerSeconds = 100;
        io.to(m.room).emit('turnTimer', { seconds: m.timerSeconds, activeSeat: m.lastState.active });
        io.to(m.room).emit('turnSwitched', { activeSeat: m.lastState.active });
      }
    } catch {}
    io.to(m.room).emit("state", m.lastState);
    pushLog({ ev: 'pushState:applied', sid: socket.id, matchId, reason: reason || '', ver: m.lastVer, active: m.lastState?.active, turn: m.lastState?.turn });
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
      try { pl.discard = Array.isArray(pl.discard) ? pl.discard : []; pl.discard.push(removed1.id === 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2); } catch {}
      try { pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : []; pl.graveyard.push(removed1.id !== 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2); } catch {}
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
