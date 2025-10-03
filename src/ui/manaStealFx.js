// Анимация визуальных эффектов для перемещения и утечки маны
function resolveManaBar(index) {
  try {
    if (typeof document === 'undefined') return null;
    if (!Number.isInteger(index)) return null;
    return document.getElementById(`mana-display-${index}`);
  } catch {
    return null;
  }
}

function computeFromSlots(before, amount) {
  const slots = [];
  const safeBefore = Number.isFinite(before) ? before : 0;
  for (let i = 0; i < amount; i += 1) {
    slots.push(Math.max(0, Math.min(9, safeBefore - 1 - i)));
  }
  return slots;
}

function computeGainSlots(beforeTo, afterTo, amount) {
  const safeBefore = Number.isFinite(beforeTo) ? beforeTo : 0;
  const safeAfter = Number.isFinite(afterTo) ? afterTo : safeBefore;
  const slots = [];
  for (let idx = safeBefore; idx < safeAfter; idx += 1) {
    slots.push(Math.max(0, Math.min(9, idx)));
  }
  while (slots.length < amount) {
    const fallback = slots.length
      ? slots[slots.length - 1]
      : Math.max(0, Math.min(9, safeAfter - 1));
    slots.push(fallback);
  }
  return slots;
}

function getSlotRect(barEl, idx) {
  if (!barEl) return null;
  const child = barEl.children?.[idx];
  if (child) return child.getBoundingClientRect();
  if (barEl.children && barEl.children.length) {
    const last = barEl.children[Math.min(idx, barEl.children.length - 1)];
    if (last) return last.getBoundingClientRect();
  }
  return barEl.getBoundingClientRect();
}

function ensureTargetVisible(toBar, toIdx) {
  if (!toBar) return;
  const targetEl = toBar.children?.[toIdx];
  if (targetEl) {
    targetEl.style.transition = 'opacity 220ms ease';
    targetEl.style.opacity = '1';
  }
}

function playArrivalSpark(toBar, toIdx) {
  const targetRect = getSlotRect(toBar, toIdx);
  if (!targetRect) {
    ensureTargetVisible(toBar, toIdx);
    return;
  }
  const spark = document.createElement('div');
  spark.className = 'mana-orb--steal-gain';
  spark.style.position = 'fixed';
  spark.style.left = `${targetRect.left + targetRect.width / 2}px`;
  spark.style.top = `${targetRect.top + targetRect.height / 2}px`;
  spark.style.transform = 'translate(-50%, -50%) scale(0.4)';
  spark.style.opacity = '0';
  spark.style.zIndex = '92';
  document.body.appendChild(spark);
  const tlGain = window.gsap?.timeline({
    onComplete: () => {
      try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
      ensureTargetVisible(toBar, toIdx);
    },
  });
  if (tlGain) {
    tlGain
      .to(spark, { duration: 0.15, opacity: 1, scale: 0.9, ease: 'power1.out' })
      .to(spark, { duration: 0.32, opacity: 0, scale: 1.2, ease: 'power2.in' }, '>-0.05');
  } else {
    spark.style.transition = 'opacity 180ms ease, transform 180ms ease';
    requestAnimationFrame(() => {
      spark.style.opacity = '1';
      spark.style.transform = 'translate(-50%, -50%) scale(0.9)';
      setTimeout(() => {
        spark.style.opacity = '0';
        spark.style.transform = 'translate(-50%, -50%) scale(1.2)';
        setTimeout(() => {
          try { if (spark.parentNode) spark.parentNode.removeChild(spark); } catch {}
          ensureTargetVisible(toBar, toIdx);
        }, 200);
      }, 200);
    });
  }
}

function spawnManaFlight({ fromBar, toBar, fromIdx, toIdx, delayMs, mode }) {
  if (!fromBar) return;
  const fromRect = getSlotRect(fromBar, fromIdx);
  if (!fromRect) return;
  const orb = document.createElement('div');
  orb.className = 'mana-orb--steal-fx';
  orb.style.position = 'fixed';
  orb.style.left = `${fromRect.left + fromRect.width / 2}px`;
  orb.style.top = `${fromRect.top + fromRect.height / 2}px`;
  orb.style.transform = 'translate(-50%, -50%) scale(0.9)';
  orb.style.opacity = '0';
  orb.style.zIndex = '90';
  document.body.appendChild(orb);

  if (mode === 'steal' && toBar && toIdx != null) {
    const targetEl = toBar.children?.[toIdx];
    if (targetEl) {
      targetEl.style.opacity = '0';
    }
  }

  const cleanup = () => {
    try { if (orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
    if (mode === 'steal' && toBar && toIdx != null) {
      playArrivalSpark(toBar, toIdx);
    }
  };

  const tl = window.gsap?.timeline({ delay: Math.max(0, delayMs) / 1000, onComplete: cleanup });
  if (tl) {
    tl
      .to(orb, { duration: 0.2, opacity: 1, scale: 1.05, ease: 'power2.out' })
      .to(orb, { duration: 0.36, y: '-32', ease: 'power1.out' }, '>-0.06')
      .to(orb, { duration: 0.28, opacity: 0, scale: 0.6, ease: 'power2.in' }, '>-0.2');
  } else {
    setTimeout(() => {
      orb.style.transition = 'transform 260ms ease, opacity 260ms ease';
      requestAnimationFrame(() => {
        orb.style.opacity = '1';
        orb.style.transform = 'translate(-50%, -80%) scale(1.05)';
        setTimeout(() => {
          orb.style.opacity = '0';
          orb.style.transform = 'translate(-50%, -110%) scale(0.6)';
          setTimeout(cleanup, 260);
        }, 200);
      });
    }, Math.max(0, delayMs));
  }
}

function animateManaTransfer({ amount, fromIndex, toIndex, beforeFrom, beforeTo, afterTo, mode }) {
  try {
    if (amount <= 0) return;
    const fromBar = resolveManaBar(fromIndex);
    if (!fromBar) return;
    const fromSlots = computeFromSlots(beforeFrom, amount);
    const toBar = mode === 'steal' ? resolveManaBar(toIndex) : null;
    const toSlots = mode === 'steal'
      ? computeGainSlots(beforeTo, afterTo, amount)
      : [];
    for (let i = 0; i < amount; i += 1) {
      const fromIdx = fromSlots[i] ?? fromSlots[fromSlots.length - 1] ?? 0;
      const toIdx = mode === 'steal'
        ? (toSlots[i] ?? toSlots[toSlots.length - 1] ?? 0)
        : null;
      spawnManaFlight({
        fromBar,
        toBar,
        fromIdx,
        toIdx,
        delayMs: i * 140,
        mode,
      });
    }
  } catch (err) {
    console.warn('[mana] animateManaTransfer failed', err);
  }
}

export function animateManaSteal(event) {
  try {
    if (!event) return;
    const amountRaw = Number(event.amount || event.count || 0);
    const amount = Math.max(0, Math.floor(amountRaw));
    const fromIndex = Number.isInteger(event.from) ? event.from : null;
    const toIndex = Number.isInteger(event.to) ? event.to : null;
    if (amount <= 0 || fromIndex == null || toIndex == null) return;
    const beforeFrom = Number.isFinite(event?.before?.fromMana)
      ? event.before.fromMana
      : (Number(event?.after?.fromMana) || 0) + amount;
    const beforeTo = Number.isFinite(event?.before?.toMana)
      ? event.before.toMana
      : Math.max(0, (Number(event?.after?.toMana) || 0) - amount);
    const afterTo = Number.isFinite(event?.after?.toMana)
      ? event.after.toMana
      : Math.min(10, beforeTo + amount);
    animateManaTransfer({
      amount,
      fromIndex,
      toIndex,
      beforeFrom,
      beforeTo,
      afterTo,
      mode: 'steal',
    });
  } catch (err) {
    console.warn('[mana] animateManaSteal failed', err);
  }
}

export function animateManaDrain(event) {
  try {
    if (!event) return;
    const amountRaw = Number(event.amount || event.count || 0);
    const amount = Math.max(0, Math.floor(amountRaw));
    const fromIndex = Number.isInteger(event.from) ? event.from : null;
    if (amount <= 0 || fromIndex == null) return;
    const beforeFrom = Number.isFinite(event?.before?.mana)
      ? event.before.mana
      : Number.isFinite(event?.before?.fromMana)
        ? event.before.fromMana
        : (Number(event?.after?.mana) || Number(event?.after?.fromMana) || 0) + amount;
    animateManaTransfer({
      amount,
      fromIndex,
      toIndex: null,
      beforeFrom,
      mode: 'drain',
    });
  } catch (err) {
    console.warn('[mana] animateManaDrain failed', err);
  }
}

try {
  if (typeof window !== 'undefined') {
    window.animateManaSteal = window.animateManaSteal || animateManaSteal;
    window.animateManaDrain = window.animateManaDrain || animateManaDrain;
  }
} catch {}

export default {
  animateManaSteal,
  animateManaDrain,
};
