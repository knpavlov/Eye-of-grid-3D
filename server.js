import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("MP server alive"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3001;

// очередь и активные матчи
const queue = [];
const matches = new Map(); // matchId -> { room, sockets:[s0,s1], lastState, lastVer, timerSeconds, timerId }

function pairIfPossible() {
  while (queue.length >= 2) {
    const s0 = queue.shift();
    const s1 = queue.shift();
    if (!s0?.connected || !s1?.connected) continue;

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
}

io.on("connection", (socket) => {
  socket.on("joinQueue", () => {
    // если socket был в комнате завершённого матча — убедимся, что он вышел
    try {
      const matchId = socket.data.matchId;
      if (matchId && matches.has(matchId)) {
        const m = matches.get(matchId);
        socket.leave(m.room);
      }
    } catch {}
    // не добавляем дубликаты в очередь
    if (!queue.includes(socket)) queue.push(socket);
    socket.data.queueing = true;
    socket.data.matchId = undefined;
    socket.data.seat = undefined;
    pairIfPossible();
  });

  // активный игрок присылает актуальный gameState
  socket.on("pushState", ({ state }) => {
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
  });

  socket.on("requestState", () => {
    const m = matches.get(socket.data.matchId);
    if (m?.lastState) socket.emit("state", m.lastState);
    if (m) socket.emit('turnTimer', { seconds: m.timerSeconds ?? 100, activeSeat: m.lastState?.active ?? 0 });
  });

  // синхронизация анимаций боя (выпады/контратаки)
  socket.on("battleAnim", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    // Маркируем событие id и строго ретранслируем обоим, включая инициатора (на клиенте фильтруем по active)
    try { if (!payload.__id) payload.__id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; } catch {}
    io.to(m.room).emit("battleAnim", payload);
  });

  // синхронизация контратаки (второй этап боя)
  socket.on("battleRetaliation", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    try { if (!payload.__id) payload.__id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; } catch {}
    io.to(m.room).emit("battleRetaliation", payload);
  });

  // синхронизация кроссфейда тайла (Fissures)
  socket.on("tileCrossfade", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    io.to(m.room).emit("tileCrossfade", payload);
  });

  // ритуальные спеллы (Holy Feast): подтверждение и визуальная синхронизация
  socket.on("ritualResolve", (payload) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    io.to(m.room).emit("ritualResolve", payload);
  });

  // Авторитетная обработка Holy Feast (без доверия к полному снапшоту от клиента)
  socket.on("holyFeast", ({ seat, spellIdx, creatureIdx }) => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    // Проверим право хода
    try {
      const expectedSeat = typeof m.lastState?.active === 'number' ? m.lastState.active : null;
      if (expectedSeat === null) return;
      if (socket.data.seat !== expectedSeat) return;
      if (seat !== expectedSeat) return;
    } catch { return; }
    const st = m.lastState;
    try {
      const pl = st.players?.[seat];
      if (!pl) return;
      const hand = pl.hand || [];
      if (typeof spellIdx !== 'number' || typeof creatureIdx !== 'number') return;
      if (creatureIdx < 0 || creatureIdx >= hand.length) return;
      if (spellIdx < 0 || spellIdx >= hand.length) return;
      const spell = hand[spellIdx];
      const creature = hand[creatureIdx];
      if (!spell || spell.type !== 'SPELL' || spell.id !== 'SPELL_PARMTETIC_HOLY_FEAST') return;
      if (!creature || creature.type !== 'UNIT') return;
      // Удаляем сначала больший индекс, чтобы не сдвинулся меньший
      const i1 = Math.max(spellIdx, creatureIdx);
      const i2 = Math.min(spellIdx, creatureIdx);
      const removed1 = hand.splice(i1, 1)[0];
      const removed2 = hand.splice(i2, 1)[0];
      try { pl.discard = Array.isArray(pl.discard) ? pl.discard : []; pl.discard.push(removed1.id === 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2); } catch {}
      try { pl.graveyard = Array.isArray(pl.graveyard) ? pl.graveyard : []; pl.graveyard.push(removed1.id !== 'SPELL_PARMTETIC_HOLY_FEAST' ? removed1 : removed2); } catch {}
      // +2 маны
      const cap = (m) => Math.min(10, m);
      pl.mana = cap((pl.mana || 0) + 2);
      // Обновим версию состояния и разошлём
      try { st.__ver = (Number(st.__ver) || 0) + 1; m.lastVer = st.__ver; } catch { m.lastVer = m.lastVer || 0; }
      io.to(m.room).emit("ritualResolve", { kind: 'HOLY_FEAST', by: seat });
      io.to(m.room).emit("state", st);
    } catch {}
  });

  // сдача матча
  socket.on("resign", () => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const loserSeat = socket.data.seat;
    const winnerSeat = loserSeat === 0 ? 1 : 0;
    io.to(m.room).emit("matchEnded", { winnerSeat });
    try { m.sockets.forEach(s => { if (s) { s.leave(m.room); s.data.matchId = undefined; s.data.seat = undefined; s.data.queueing = false; } }); } catch {}
    if (m.timerId) clearInterval(m.timerId);
    matches.delete(matchId);
  });

  socket.on("disconnect", () => {
    const i = queue.indexOf(socket);
    if (i >= 0) queue.splice(i, 1);
    const matchId = socket.data.matchId;
    if (matchId && matches.has(matchId)) {
      const m = matches.get(matchId);
      io.to(m.room).emit("opponentLeft");
      // очистить метаданные у обоих сокетов
      try { m.sockets.forEach(s => { if (s) { s.leave(m.room); s.data.matchId = undefined; s.data.seat = undefined; s.data.queueing = false; } }); } catch {}
      if (m.timerId) clearInterval(m.timerId);
      matches.delete(matchId);
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
