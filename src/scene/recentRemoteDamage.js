/**
 * Кэш недавно отображённого урона, чтобы не показывать всплывающие числа дважды.
 */
export const recentRemoteDamage = new Map();

/** Сбросить весь кэш. */
export function clearRecentRemoteDamage() {
  recentRemoteDamage.clear();
}

// Экспорт в window для совместимости со старым кодом
try {
  if (typeof window !== 'undefined') window.RECENT_REMOTE_DAMAGE = recentRemoteDamage;
} catch {}
