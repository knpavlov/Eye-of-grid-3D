import { issueToken, verifyToken } from './authService.js';
import { getUserById, toPublicUser } from '../repositories/usersRepository.js';

function extractToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const trimmed = rawToken.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

export async function resolveUserFromToken(rawToken) {
  const token = extractToken(rawToken);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const user = await getUserById(payload.sub);
    if (!user) return null;
    return { user, token, payload };
  } catch (err) {
    console.warn('[sessionService] Токен отклонён', err?.message || err);
    return null;
  }
}

export function createAuthPayload(user, options = {}) {
  if (!user) throw new Error('Пользователь не найден');
  const token = issueToken(user, options);
  const profile = toPublicUser(user);
  return { token, user: profile };
}

export function toClientProfile(user) {
  return toPublicUser(user);
}
