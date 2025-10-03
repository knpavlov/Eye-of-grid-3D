// Активные уведомления о потере маны по индексам игроков
const activeDrainToasts = [null, null];

function clearActiveDrainToast(ownerIndex) {
  if (!Number.isInteger(ownerIndex)) return;
  const current = activeDrainToasts[ownerIndex];
  if (!current) return;
  if (current.fadeTimeout) {
    try { clearTimeout(current.fadeTimeout); } catch {}
  }
  if (current.removeTimeout) {
    try { clearTimeout(current.removeTimeout); } catch {}
  }
  const el = current.el;
  if (el && el.parentNode) {
    try { el.parentNode.removeChild(el); } catch {}
  }
  activeDrainToasts[ownerIndex] = null;
}

function formatManaLossWord(amount) {
  const value = Math.abs(Number(amount) || 0);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'маны';
  const mod10 = mod100 % 10;
  if (mod10 === 1) return 'мана';
  if (mod10 >= 2 && mod10 <= 4) return 'маны';
  return 'маны';
}

// Временное сообщение о потере маны для конкретного игрока
export function showManaDrainMessage(ownerIndex, amount, opts = {}) {
  try {
    if (!Number.isInteger(ownerIndex)) return;
    const positiveAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (positiveAmount <= 0) return;
    const manaBar = document.getElementById(`mana-display-${ownerIndex}`);
    if (!manaBar) return;
    const rect = manaBar.getBoundingClientRect?.();
    if (!rect) return;

    clearActiveDrainToast(ownerIndex);

    const toast = document.createElement('div');
    toast.className = 'mana-drain-toast';
    const unit = formatManaLossWord(positiveAmount);
    toast.textContent = `У вас забрали ${positiveAmount} ${unit}`;
    toast.style.position = 'fixed';
    toast.style.left = `${rect.left + rect.width / 2}px`;

    const viewportHeight = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight))
      ? window.innerHeight
      : 0;
    const preferAbove = viewportHeight ? (rect.top > viewportHeight / 2) : (ownerIndex === 0);
    const verticalOffset = Math.max(8, Math.min(64, Number(opts.offsetY) || 24));
    if (preferAbove) {
      toast.style.top = `${rect.top - verticalOffset}px`;
      toast.dataset.manaToastDirection = 'up';
    } else {
      toast.style.top = `${rect.bottom + verticalOffset}px`;
      toast.dataset.manaToastDirection = 'down';
    }

    toast.style.opacity = '0';
    toast.style.transform = preferAbove
      ? 'translate(-50%, -6px) scale(0.88)'
      : 'translate(-50%, 6px) scale(0.88)';
    toast.style.pointerEvents = 'none';
    toast.style.zIndex = '95';

    const root = document.body || document.getElementById('ui') || null;
    if (!root) return;
    root.appendChild(toast);

    const animateIn = () => {
      try {
        toast.style.transition = 'transform 280ms ease, opacity 280ms ease';
        toast.style.opacity = '1';
        toast.style.transform = preferAbove
          ? 'translate(-50%, -22px) scale(1)'
          : 'translate(-50%, 22px) scale(1)';
      } catch {}
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(animateIn);
    } else {
      setTimeout(animateIn, 16);
    }

    const duration = Math.max(900, Number(opts.duration) || 2400);
    const fadeTimeout = setTimeout(() => {
      try {
        toast.style.opacity = '0';
        toast.style.transform = preferAbove
          ? 'translate(-50%, -48px) scale(0.9)'
          : 'translate(-50%, 48px) scale(0.9)';
      } catch {}
    }, duration);

    const removeTimeout = setTimeout(() => {
      clearActiveDrainToast(ownerIndex);
    }, duration + 360);

    activeDrainToasts[ownerIndex] = { el: toast, fadeTimeout, removeTimeout };
  } catch (err) {
    console.warn('[mana] showManaDrainMessage failed', err);
  }
}

// Анимация визуального эффекта кражи маны
export function animateManaSteal(event) {
  try {
    if (!event) return;
    const amountRaw = Number(event.amount || event.count || 0);
    const amount = Math.max(0, Math.floor(amountRaw));
    const fromIndex = Number.isInteger(event.from) ? event.from : null;
    const toIndexRaw = Number.isInteger(event.to) ? event.to : null;
    const drainOnly = event?.drainOnly === true || event?.mode === 'DRAIN' || event?.drain === true;
    if (amount <= 0 || fromIndex == null) return;
    const fromBar = document.getElementById(`mana-display-${fromIndex}`);
    if (!fromBar) return;
    const toBar = (!drainOnly && toIndexRaw != null)
      ? document.getElementById(`mana-display-${toIndexRaw}`)
      : null;
    if (!drainOnly && (!toBar || toIndexRaw == null)) return;

    const beforeFrom = Number.isFinite(event?.before?.fromMana)
      ? event.before.fromMana
      : (Number(event?.after?.fromMana) || 0) + amount;
    const beforeTo = (!drainOnly && Number.isFinite(event?.before?.toMana))
      ? event.before.toMana
      : (!drainOnly ? Math.max(0, (Number(event?.after?.toMana) || 0) - amount) : 0);
    const afterTo = (!drainOnly && Number.isFinite(event?.after?.toMana))
      ? event.after.toMana
      : (!drainOnly ? Math.min(10, beforeTo + amount) : 0);

    const fromSlots = [];
    for (let i = 0; i < amount; i += 1) {
      fromSlots.push(Math.max(0, Math.min(9, beforeFrom - 1 - i)));
    }
    const newSlots = [];
    if (!drainOnly) {
      for (let idx = beforeTo; idx < afterTo; idx += 1) {
        newSlots.push(Math.max(0, Math.min(9, idx)));
      }
      while (newSlots.length < amount) {
        const fallback = newSlots.length ? newSlots[newSlots.length - 1] : Math.max(0, Math.min(9, afterTo - 1));
        newSlots.push(fallback);
      }
    }

    const getSlotRect = (barEl, idx) => {
      if (!barEl) return null;
      const child = barEl.children?.[idx];
      if (child) return child.getBoundingClientRect();
      if (barEl.children && barEl.children.length) {
        const last = barEl.children[Math.min(idx, barEl.children.length - 1)];
        if (last) return last.getBoundingClientRect();
      }
      return barEl.getBoundingClientRect();
    };

    const spawnDrain = (fromIdx, delayMs) => {
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

      const slotEl = fromBar.children?.[fromIdx];
      if (slotEl) {
        slotEl.style.transition = 'opacity 220ms ease';
        slotEl.style.opacity = '0';
        const restoreDelay = Math.max(260, delayMs + 260);
        setTimeout(() => {
          try { slotEl.style.opacity = '1'; } catch {}
        }, restoreDelay);
      }

      const cleanup = () => {
        try { if (orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
      };

      const tl = window.gsap?.timeline({ delay: Math.max(0, delayMs) / 1000, onComplete: cleanup });
      if (tl) {
        tl.to(orb, { duration: 0.2, opacity: 1, scale: 1.05, ease: 'power2.out' })
          .to(orb, { duration: 0.36, y: '-42', ease: 'power1.out' }, '>-0.06')
          .to(orb, { duration: 0.28, opacity: 0, scale: 0.6, ease: 'power2.in' }, '>-0.2');
      } else {
        setTimeout(() => {
          orb.style.transition = 'transform 260ms ease, opacity 260ms ease';
          requestAnimationFrame(() => {
            orb.style.opacity = '1';
            orb.style.transform = 'translate(-50%, -80%) scale(1.05)';
            setTimeout(() => {
              orb.style.opacity = '0';
              orb.style.transform = 'translate(-50%, -118%) scale(0.6)';
              setTimeout(cleanup, 260);
            }, 200);
          });
        }, Math.max(0, delayMs));
      }
    };

    const spawnSteal = (fromIdx, toIdx, delayMs) => {
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

      const ensureTargetVisible = () => {
        const targetEl = toBar.children?.[toIdx];
        if (targetEl) {
          targetEl.style.transition = 'opacity 220ms ease';
          targetEl.style.opacity = '1';
        }
      };

      const playArrival = () => {
        const targetRect = getSlotRect(toBar, toIdx);
        if (!targetRect) { ensureTargetVisible(); return; }
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
            ensureTargetVisible();
          },
        });
        if (tlGain) {
          tlGain.to(spark, { duration: 0.15, opacity: 1, scale: 0.9, ease: 'power1.out' })
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
                ensureTargetVisible();
              }, 200);
            }, 200);
          });
        }
      };

      const targetEl = toBar.children?.[toIdx];
      if (targetEl) {
        targetEl.style.opacity = '0';
      }

      const cleanup = () => {
        try { if (orb.parentNode) orb.parentNode.removeChild(orb); } catch {}
        playArrival();
      };

      const tl = window.gsap?.timeline({ delay: Math.max(0, delayMs) / 1000, onComplete: cleanup });
      if (tl) {
        tl.to(orb, { duration: 0.2, opacity: 1, scale: 1.05, ease: 'power2.out' })
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
    };

    for (let i = 0; i < amount; i += 1) {
      const fromIdx = fromSlots[i] ?? fromSlots[fromSlots.length - 1] ?? 0;
      if (drainOnly) {
        spawnDrain(fromIdx, i * 140);
      } else {
        const toIdx = newSlots[i] ?? newSlots[newSlots.length - 1] ?? 0;
        spawnSteal(fromIdx, toIdx, i * 140);
      }
    }
  } catch (err) {
    console.warn('[mana] animateManaSteal failed', err);
  }
}

try {
  if (typeof window !== 'undefined') {
    window.animateManaSteal = window.animateManaSteal || animateManaSteal;
    window.__ui = window.__ui || {};
    window.__ui.manaStealFx = window.__ui.manaStealFx || {};
    window.__ui.manaStealFx.animateManaSteal = animateManaSteal;
    window.__ui.manaStealFx.showManaDrainMessage = showManaDrainMessage;
  }
} catch {}

export default {
  animateManaSteal,
  showManaDrainMessage,
};
