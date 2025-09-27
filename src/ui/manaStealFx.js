// Анимация визуального эффекта кражи маны
export function animateManaSteal(event) {
  try {
    if (!event) return;
    const amountRaw = Number(event.amount || event.count || 0);
    const amount = Math.max(0, Math.floor(amountRaw));
    const fromIndex = Number.isInteger(event.from) ? event.from : null;
    const toIndex = Number.isInteger(event.to) ? event.to : null;
    if (amount <= 0 || fromIndex == null || toIndex == null) return;
    const fromBar = document.getElementById(`mana-display-${fromIndex}`);
    const toBar = document.getElementById(`mana-display-${toIndex}`);
    if (!fromBar || !toBar) return;

    const beforeFrom = Number.isFinite(event?.before?.fromMana)
      ? event.before.fromMana
      : (Number(event?.after?.fromMana) || 0) + amount;
    const beforeTo = Number.isFinite(event?.before?.toMana)
      ? event.before.toMana
      : Math.max(0, (Number(event?.after?.toMana) || 0) - amount);
    const afterTo = Number.isFinite(event?.after?.toMana)
      ? event.after.toMana
      : Math.min(10, beforeTo + amount);

    const fromSlots = [];
    for (let i = 0; i < amount; i += 1) {
      fromSlots.push(Math.max(0, Math.min(9, beforeFrom - 1 - i)));
    }
    const newSlots = [];
    for (let idx = beforeTo; idx < afterTo; idx += 1) {
      newSlots.push(Math.max(0, Math.min(9, idx)));
    }
    while (newSlots.length < amount) {
      const fallback = newSlots.length ? newSlots[newSlots.length - 1] : Math.max(0, Math.min(9, afterTo - 1));
      newSlots.push(fallback);
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
      const toIdx = newSlots[i] ?? newSlots[newSlots.length - 1] ?? 0;
      spawnSteal(fromIdx, toIdx, i * 140);
    }
  } catch (err) {
    console.warn('[mana] animateManaSteal failed', err);
  }
}

try {
  if (typeof window !== 'undefined') {
    window.animateManaSteal = window.animateManaSteal || animateManaSteal;
  }
} catch {}

export default {
  animateManaSteal,
};
