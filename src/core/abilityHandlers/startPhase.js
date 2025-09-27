// Обработка эффектов начала хода (проксируем в модуль прироста маны)
import { applyTurnStartManaEffects as applyTurnStartManaEffectsInternal } from './manaGain.js';

export const applyTurnStartManaEffects = applyTurnStartManaEffectsInternal;

export default { applyTurnStartManaEffects };
