// Подсветка доступных клеток на поле
import { getCtx } from './context.js';

// Список активных подсветок для последующей очистки
let ACTIVE = [];

// Включает подсветку для набора клеток вида [{r,c}, ...]
export function highlightCells(cells = []) {
  clearHighlights();
  const ctx = getCtx();
  const { THREE, tileFrames } = ctx;
  const gsap = (typeof window !== 'undefined') ? window.gsap : null;
  if (!THREE || !gsap || !tileFrames) return;

  for (const { r, c } of cells) {
    const frame = tileFrames?.[r]?.[c];
    if (!frame) continue;
    const mats = [];
    frame.traverse(obj => {
      if (obj.isMesh && obj.material) {
        obj.material.color = new THREE.Color(0x7dd3fc); // голубая магия
        obj.material.opacity = 0;
        obj.material.transparent = true;
        obj.material.depthWrite = false;
        obj.material.blending = THREE.AdditiveBlending;
        mats.push(obj.material);
      }
    });
    const tl = gsap.to(mats, {
      opacity: 0.9,
      duration: 0.6,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    ACTIVE.push({ frame, tl });
  }
}

// Отключает все подсветки
export function clearHighlights() {
  const ctx = getCtx();
  const gsap = (typeof window !== 'undefined') ? window.gsap : null;
  for (const h of ACTIVE) {
    try { h.tl.kill(); } catch {}
    h.frame.traverse(obj => {
      if (obj.isMesh && obj.material) {
        obj.material.opacity = 0;
      }
    });
  }
  ACTIVE = [];
  if (gsap) { try { gsap.killTweensOf && gsap.killTweensOf('*'); } catch {} }
}

// Экспортируем для использования в окне
try {
  if (typeof window !== 'undefined') {
    window.__tileHighlights = { highlightCells, clearHighlights };
  }
} catch {}

export default { highlightCells, clearHighlights };
