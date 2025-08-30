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
const matches = new Map(); // matchId -> { room, sockets:[s0,s1], lastState, timerSeconds, timerId }

function pairIfPossible() {
  while (queue.length >= 2) {
    const s0 = queue.shift();
    const s1 = queue.shift();
    if (!s0?.connected || !s1?.connected) continue;

    const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const room = `room_${matchId}`;
    s0.join(room);
    s1.join(room);

    matches.set(matchId, { room, sockets:[s0,s1], lastState:null, timerSeconds: 100, timerId: null });
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

  // сдача матча
  socket.on("resign", () => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const loserSeat = socket.data.seat;
    const winnerSeat = loserSeat === 0 ? 1 : 0;
    io.to(m.room).emit("matchEnded", { winnerSeat });
    try { m.sockets.forEach(s => { if (s) { s.data.matchId = undefined; s.data.seat = undefined; s.data.queueing = false; } }); } catch {}
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

server.listen(PORT, () => console.log("MP server on", PORT));
