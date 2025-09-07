// Настройки анимации добора карты
export const DRAW_CARD_TUNE = {
  posY: 8.5,   // высота
  posZ: 2.4,   // дистанция к камере (чем меньше, тем ближе)
  scale: 1.7,  // масштаб
  // Ручная довращалка (в градусах)
  pitchDeg: 45, // наклон вперёд/назад (ось X)
  yawDeg: 0,    // поворот влево/вправо (ось Y)
  rollDeg: 0    // крен (ось Z)
};

// Совместимость со старым глобальным API
try { if (typeof window !== 'undefined') window.DRAW_CARD_TUNE = DRAW_CARD_TUNE; } catch {}

export default DRAW_CARD_TUNE;
