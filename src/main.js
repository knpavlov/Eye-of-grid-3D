import { initState } from './state.js';
import { initBoard } from './board.js';
import { initRender } from './render.js';
import { initUI } from './ui.js';

const state = initState();
initBoard(state);
initRender(state);
initUI(state);
