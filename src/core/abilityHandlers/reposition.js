// Модуль обработки эффектов, меняющих положение существ после атаки
// Логика изолирована от визуальной части для дальнейшего переиспользования
import { CARDS } from '../cards.js';

const inBounds = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;

function getUnitUid(unit) {
  return (unit && unit.uid != null) ? unit.uid : null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeElements(value) {
  const set = new Set();
  for (const raw of toArray(value)) {
    if (typeof raw === 'string' && raw) {
      set.add(raw.toUpperCase());
    }
  }
  return set;
}

function normalizePushConfig(raw) {
  if (!raw) return null;
  const base = {
    distance: 1,
    preventRetaliation: true,
    requireEmpty: true,
    elements: null,
  };
  if (raw === true) return base;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { ...base, distance: Math.max(1, Math.abs(Math.trunc(raw))) };
  }
  if (typeof raw === 'object') {
    const cfg = { ...base };
    if (typeof raw.distance === 'number' && Number.isFinite(raw.distance)) {
      cfg.distance = Math.max(1, Math.abs(Math.trunc(raw.distance)));
    }
    if (raw.preventRetaliation === false) cfg.preventRetaliation = false;
    if (raw.requireEmpty === false) cfg.requireEmpty = false;
    const elems = normalizeElements(raw.onlyOnElement || raw.element || raw.elements);
    cfg.elements = elems.size ? elems : null;
    return cfg;
  }
  return base;
}

function directionBetween(from, to) {
  if (!from || !to) return null;
  const dr = (to.r ?? 0) - (from.r ?? 0);
  const dc = (to.c ?? 0) - (from.c ?? 0);
  if (dr === 0 && dc === 0) return null;
  if (dr !== 0 && dc !== 0) return null;
  if (dr < 0) return { dir: 'N', dr: -1, dc: 0 };
  if (dr > 0) return { dir: 'S', dr: 1, dc: 0 };
  if (dc < 0) return { dir: 'W', dr: 0, dc: -1 };
  if (dc > 0) return { dir: 'E', dr: 0, dc: 1 };
  return null;
}

export function collectRepositionOnDamage(state, context = {}) {
  const events = [];
  const prevent = new Set();
  if (!state?.board) return { events, preventRetaliation: [] };

  const { attackerRef, attackerPos, tpl, hits } = context;
  if (!tpl || !Array.isArray(hits) || !hits.length) {
    return { events, preventRetaliation: [] };
  }

  const swapElements = normalizeElements(
    tpl.swapWithTargetOnElement || (tpl.switchOnDamage ? tpl.element : null)
  );
  const allowSwapAny = !!tpl.swapOnDamage;
  const pushCfg = normalizePushConfig(tpl.pushTargetOnDamage);
  const rotateOnDamage = !!tpl.rotateTargetOnDamage;

  let swapTriggered = false;

  for (const hit of hits) {
    if (!hit) continue;
    const target = hit.target;
    const tplTarget = hit.tplTarget;
    if (!target || !tplTarget) continue;
    const key = hit.key || `${hit.r},${hit.c}`;
    const cellElement = hit.cellElement ?? state.board?.[hit.r]?.[hit.c]?.element ?? null;

    if (!swapTriggered) {
      let shouldSwap = false;
      if (allowSwapAny) {
        shouldSwap = true;
      } else if (swapElements.size && cellElement && swapElements.has(cellElement)) {
        shouldSwap = true;
      }
      if (shouldSwap) {
        events.push({
          type: 'SWAP_POSITIONS',
          attacker: attackerRef,
          target: { uid: getUnitUid(target), r: hit.r, c: hit.c, tplId: tplTarget?.id ?? target.tplId },
        });
        swapTriggered = true;
        prevent.add(key);
      }
    }

    if (rotateOnDamage) {
      events.push({
        type: 'ROTATE_TARGET',
        target: { uid: getUnitUid(target), r: hit.r, c: hit.c, tplId: tplTarget?.id ?? target.tplId },
        faceAwayFrom: attackerRef,
      });
      prevent.add(key);
    }

    if (pushCfg) {
      if (pushCfg.elements && cellElement && !pushCfg.elements.has(cellElement)) {
        // поле не подходит — пропускаем перемещение, но возможность контратаки всё равно блокируем
        if (pushCfg.preventRetaliation) prevent.add(key);
        continue;
      }
      const dirInfo = directionBetween(attackerPos || attackerRef, { r: hit.r, c: hit.c });
      if (!dirInfo) {
        if (pushCfg.preventRetaliation) prevent.add(key);
        continue;
      }
      const destR = hit.r + dirInfo.dr * pushCfg.distance;
      const destC = hit.c + dirInfo.dc * pushCfg.distance;
      if (!inBounds(destR, destC)) {
        if (pushCfg.preventRetaliation) prevent.add(key);
        continue;
      }
      const destUnit = state.board?.[destR]?.[destC]?.unit;
      let blocked = false;
      if (destUnit) {
        const tplDest = CARDS[destUnit.tplId];
        const aliveDest = (destUnit.currentHP ?? tplDest?.hp ?? 0) > 0;
        if (aliveDest && pushCfg.requireEmpty) {
          blocked = true;
        }
      }
      if (!blocked) {
        events.push({
          type: 'PUSH_TARGET',
          target: { uid: getUnitUid(target), r: hit.r, c: hit.c, tplId: tplTarget?.id ?? target.tplId },
          to: { r: destR, c: destC },
          direction: dirInfo.dir,
          source: attackerRef,
        });
      }
      if (pushCfg.preventRetaliation) prevent.add(key);
    }
  }

  return { events, preventRetaliation: Array.from(prevent) };
}
