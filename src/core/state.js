// Game state: reducer + helpers
import { capMana } from './constants.js';
import { shuffle, drawOne, drawOneNoAdd, countControlled, countUnits, randomBoard, startGame } from './board.js';

export { shuffle, drawOne, drawOneNoAdd, countControlled, countUnits, randomBoard, startGame };

// Actions
export const A = {
  INIT: 'INIT',
  REPLACE_STATE: 'REPLACE_STATE',
  END_TURN: 'END_TURN',
};

export function reducer(state, action) {
  switch (action.type) {
    case A.INIT: {
      const s = startGame(action.deck0, action.deck1);
      s.__ver = (state?.__ver || 0) + 1;
      return s;
    }
    case A.REPLACE_STATE: {
      const incoming = action.payload;
      const incomingVer = Number(incoming?.__ver) || 0;
      const currentVer = Number(state?.__ver) || 0;
      if (incomingVer < currentVer) return state;
      return { ...incoming };
    }
    case A.END_TURN: {
      if (!state || state.winner != null) return state;
      const s = JSON.parse(JSON.stringify(state));
      const plOld = s.players[s.active];
      // Принудительный дискард до 7 карт перед передачей хода
      try {
        plOld.graveyard = Array.isArray(plOld.graveyard) ? plOld.graveyard : [];
        while (Array.isArray(plOld.hand) && plOld.hand.length > 7) {
          plOld.graveyard.push(plOld.hand.pop());
        }
      } catch {}
      const controlled = countControlled(s, s.active);
      if (controlled >= 5) { s.winner = s.active; s.__ver = (s.__ver || 0) + 1; return s; }
      s.active = s.active === 0 ? 1 : 0;
      s.turn += 1;
      const pl = s.players[s.active];
      const before = pl.mana || 0;
      
      // ВАЖНО: Сохраняем предыдущее значение маны для правильной анимации
      pl._beforeMana = before;
      pl.mana = capMana(before + 2);
      
      // Optional draw: only enqueue for animation elsewhere; here push straight for logic
      const drawn = drawOneNoAdd(s, s.active);
      if (drawn) pl.hand.push(drawn);
      s.__ver = (s.__ver || 0) + 1;
      return s;
    }
    default: return state || startGame();
  }
}


