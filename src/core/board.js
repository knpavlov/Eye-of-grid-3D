import { DECKS } from './decks.js';
// Дефолтная колода для запуска игры
const DEFAULT_DECK = DECKS[0]?.cards || [];

// Utilities
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function drawOne(state, player) {
  const pl = state.players[player];
  if (!pl.deck.length) return null;
  const card = pl.deck.shift();
  if (card) pl.hand.push(card);
  return card || null;
}

export function drawOneNoAdd(state, player) {
  const pl = state.players[player];
  if (!pl.deck.length) return null;
  const card = pl.deck.shift();
  return card || null;
}

export function countControlled(state, player) {
  let count = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const unit = state.board[r][c].unit;
    if (!unit) continue;
    if (unit.owner !== player) continue;
    if (unit.possessed && unit.possessed.by === player) continue;
    count++;
  }
  return count;
}

// Подсчёт всех существ на поле
export function countUnits(state) {
  let count = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board[r][c].unit) count++;
    }
  }
  return count;
}

export function randomBoard() {
  // 3x3 board with element constraints:
  // - Center (1,1) is always BIOLITH
  // - Remaining 8 tiles: exactly two of each FIRE, WATER, EARTH, FOREST placed randomly
  const picks = ['FIRE','FIRE','WATER','WATER','EARTH','EARTH','FOREST','FOREST'];
  // Fisher–Yates shuffle
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  let k = 0;
  const board = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ element: 'FIRE', unit: null })));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) { board[r][c].element = 'BIOLITH'; continue; }
      board[r][c].element = picks[k++];
    }
  }
  return board;
}

export function startGame(deck0 = DEFAULT_DECK, deck1 = DEFAULT_DECK) {
  const state = {
    board: randomBoard(),
    players: [
      { name: 'Player 1', deck: shuffle(deck0.filter(Boolean)), hand: [], discard: [], graveyard: [], mana: 2, maxMana: 10 },
      { name: 'Player 2', deck: shuffle(deck1.filter(Boolean)), hand: [], discard: [], graveyard: [], mana: 0, maxMana: 10 },
    ],
    active: 0,
    turn: 1,
    winner: null,
    __ver: 0,
    summoningUnlocked: false, // поле по умолчанию заблокировано
    pendingDiscards: [],
  };
  for (let i = 0; i < 5; i++) { drawOne(state, 0); drawOne(state, 1); }
  return state;
}
