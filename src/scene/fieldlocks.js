// Отрисовка клеток, защищённых от fieldquake/exchange
import { showFieldLockTiles, clearFieldLockTiles } from './fieldLockEffect.js';
import { computeFieldquakeLockedCells } from '../core/fieldLocks.js';

export function renderFieldLocks(gameState) {
  const cells = computeFieldquakeLockedCells(gameState);
  if (cells.length) showFieldLockTiles(cells);
  else clearFieldLockTiles();
}

export default { renderFieldLocks };
