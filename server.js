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
const matches = new Map(); // matchId -> { room, sockets:[s0,s1], lastState }

function pairIfPossible() {
  while (queue.length >= 2) {
    const s0 = queue.shift();
    const s1 = queue.shift();
    if (!s0?.connected || !s1?.connected) continue;

    const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const room = `room_${matchId}`;
    s0.join(room);
    s1.join(room);

    matches.set(matchId, { room, sockets:[s0,s1], lastState:null });
    s0.data.matchId = matchId; s0.data.seat = 0;
    s1.data.matchId = matchId; s1.data.seat = 1;

    s0.emit("matchFound", { matchId, seat: 0 });
    s1.emit("matchFound", { matchId, seat: 1 });
  }
}

io.on("connection", (socket) => {
  socket.on("joinQueue", () => {
    if (socket.data.queueing) return;
    socket.data.queueing = true;
    queue.push(socket);
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
      io.to(m.room).emit("state", m.lastState);
      return;
    }
    // Иначе принимаем только от игрока, чей seat совпадает с active в последнем состоянии
    try {
      const expectedSeat = typeof m.lastState?.active === 'number' ? m.lastState.active : null;
      if (expectedSeat === null) return;
      if (socket.data.seat !== expectedSeat) return;
    } catch { return; }
    m.lastState = state ?? m.lastState;
    io.to(m.room).emit("state", m.lastState);
  });

  socket.on("requestState", () => {
    const m = matches.get(socket.data.matchId);
    if (m?.lastState) socket.emit("state", m.lastState);
  });

  // сдача матча
  socket.on("resign", () => {
    const matchId = socket.data.matchId;
    if (!matchId || !matches.has(matchId)) return;
    const m = matches.get(matchId);
    const loserSeat = socket.data.seat;
    const winnerSeat = loserSeat === 0 ? 1 : 0;
    io.to(m.room).emit("matchEnded", { winnerSeat });
    matches.delete(matchId);
  });

  socket.on("disconnect", () => {
    const i = queue.indexOf(socket);
    if (i >= 0) queue.splice(i, 1);
    const matchId = socket.data.matchId;
    if (matchId && matches.has(matchId)) {
      const m = matches.get(matchId);
      io.to(m.room).emit("opponentLeft");
      matches.delete(matchId);
    }
  });
});

server.listen(PORT, () => console.log("MP server on", PORT));
