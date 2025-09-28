// Управление отображаемыми именами игроков
// Логика максимально отделена от UI, чтобы при переносе на Unity оставить неизменной

const DEFAULT_NAMES = ['Player 1', 'Player 2'];

let localSeat = 0;
let localProfile = null;
let networkPlayers = [null, null];
const listeners = new Set();

function sanitize(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
}

function profilesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.nickname === b.nickname && a.email === b.email;
}

function notify() {
  listeners.forEach(cb => {
    try { cb(); } catch (err) { console.warn('[playerNames] Ошибка слушателя', err); }
  });
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    id: profile.id || null,
    nickname: sanitize(profile.nickname),
    email: sanitize(profile.email),
  };
}

function fallbackName(index) {
  if (index === 0 || index === 1) return DEFAULT_NAMES[index];
  return `Player ${Number(index) + 1}`;
}

export function setLocalSeat(seat) {
  const next = seat === 1 ? 1 : 0;
  if (localSeat === next) return false;
  localSeat = next;
  notify();
  return true;
}

export function setLocalProfile(profile) {
  const next = normalizeProfile(profile);
  if (profilesEqual(localProfile, next)) return false;
  localProfile = next;
  notify();
  return true;
}

export function setNetworkPlayers(players = [], seat = null) {
  const normalized = [null, null];
  for (let i = 0; i < 2; i += 1) {
    const raw = players[i];
    normalized[i] = normalizeProfile(raw);
  }
  const networkChanged = !profilesEqual(networkPlayers[0], normalized[0]) || !profilesEqual(networkPlayers[1], normalized[1]);
  networkPlayers = normalized;
  let seatChanged = false;
  if (seat === 0 || seat === 1) {
    seatChanged = setLocalSeat(seat);
  }
  if (networkChanged) {
    if (!seatChanged) notify();
    return true;
  }
  return seatChanged;
}

export function clearNetworkPlayers() {
  const empty = [null, null];
  if (profilesEqual(networkPlayers[0], empty[0]) && profilesEqual(networkPlayers[1], empty[1])) return false;
  networkPlayers = empty;
  notify();
  return true;
}

function resolveFromProfile(profile, fallback) {
  if (!profile) return fallback;
  const name = sanitize(profile.nickname) || sanitize(profile.email);
  return name || fallback;
}

export function resolvePlayerName(index) {
  const fallback = fallbackName(index);
  if (index !== 0 && index !== 1) return fallback;

  const fromNetwork = resolveFromProfile(networkPlayers[index], null);
  if (fromNetwork) return fromNetwork;

  if (index === localSeat) {
    const localName = resolveFromProfile(localProfile, null);
    if (localName) return localName;
  }

  // Если сетевые данные не пришли, но локальный профиль совпадает по id — используем его
  const byId = localProfile?.id
    ? networkPlayers.find(p => p && p.id === localProfile.id)
    : null;
  if (byId) {
    const mapped = resolveFromProfile(byId, null);
    if (mapped) return mapped;
  }

  return fallback;
}

export function getSeatLabel(seat) {
  if (seat !== 0 && seat !== 1) return '—';
  return resolvePlayerName(seat);
}

export function attachPlayerNames(state) {
  if (!state || !Array.isArray(state.players)) return state;
  let changed = false;
  const players = state.players.map((player, index) => {
    const desiredName = resolvePlayerName(index);
    if (player && player.name === desiredName) return player;
    changed = true;
    return { ...player, name: desiredName };
  });
  if (!changed) return state;
  return { ...state, players };
}

export function syncPlayerNamesWithWindow() {
  if (typeof window === 'undefined') return;
  const current = window.gameState;
  if (!current) return;
  const next = attachPlayerNames(current);
  if (next === current) return;
  try {
    if (typeof window.applyGameState === 'function') {
      window.applyGameState(next);
    } else {
      window.gameState = next;
    }
  } catch (err) {
    console.warn('[playerNames] Не удалось синхронизировать имена игроков', err);
  }
}

export function onPlayerNamesChanged(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function resetPlayerNames() {
  localProfile = null;
  networkPlayers = [null, null];
  localSeat = 0;
  notify();
}

export default {
  setLocalSeat,
  setLocalProfile,
  setNetworkPlayers,
  clearNetworkPlayers,
  resolvePlayerName,
  getSeatLabel,
  attachPlayerNames,
  syncPlayerNamesWithWindow,
  onPlayerNamesChanged,
  resetPlayerNames,
};
