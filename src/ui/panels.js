// Panels: log/help/orientation/unit actions/prompt

export function showOrientationPanel(){ try { document.getElementById('orientation-panel')?.classList.remove('hidden'); } catch {} }
export function hideOrientationPanel(){ try { document.getElementById('orientation-panel')?.classList.add('hidden'); if (typeof window !== 'undefined') window.pendingPlacement = null; } catch {} }

export function showUnitActionPanel(unitMesh){
  try {
    if (!unitMesh) return;
    try { if (typeof window !== 'undefined') window.selectedUnit = unitMesh; } catch {}
    const unitData = unitMesh.userData?.unitData; const cardData = unitMesh.userData?.cardData; const gs = (typeof window !== 'undefined') ? window.gameState : null;
    if (!gs || !unitData || !cardData) return;
    const el = document.getElementById('unit-info'); if (el) el.textContent = `${cardData.name} (${(unitMesh.userData.row||0) + 1},${(unitMesh.userData.col||0) + 1})`;
    const alreadyAttacked = unitData.lastAttackTurn === gs.turn;
    const attackBtn = document.getElementById('attack-btn'); if (attackBtn) {
      attackBtn.disabled = !!alreadyAttacked;
      const cost = (typeof window !== 'undefined' && typeof window.attackCost === 'function') ? window.attackCost(cardData) : 1;
      attackBtn.textContent = alreadyAttacked ? 'Already attacked' : `Attack (-${cost})`;
    }
    const rotateCost = (typeof window !== 'undefined' && typeof window.attackCost === 'function') ? window.attackCost(cardData) : 1;
    const alreadyRotated = unitData.lastRotateTurn === gs.turn;
    const rCw = document.getElementById('rotate-cw-btn'); const rCcw = document.getElementById('rotate-ccw-btn');
    if (rCw && rCcw) { rCw.disabled = !!alreadyRotated; rCcw.disabled = !!alreadyRotated; rCw.textContent = alreadyRotated ? 'Already rotated' : `Rotate → (-${rotateCost})`; rCcw.textContent = alreadyRotated ? 'Already rotated' : `Rotate ← (-${rotateCost})`; }
    // Flash rings on potential targets
    try {
      const computeHits = (typeof window !== 'undefined') ? window.computeHits : null;
      const unitMeshes = (typeof window !== 'undefined') ? window.unitMeshes || [] : [];
      const THREE = (typeof window !== 'undefined') ? window.THREE : null;
      const effectsGroup = (typeof window !== 'undefined') ? window.effectsGroup : (window.__scene?.getCtx()?.effectsGroup);
      if (computeHits && THREE && effectsGroup) {
        const hits = computeHits(gs, unitMesh.userData.row, unitMesh.userData.col);
        for (const h of hits) {
          const m = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
          if (!m) continue;
          const ringGeom = new THREE.RingGeometry(0.6, 0.8, 24);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent:true, opacity:0.7, side:THREE.DoubleSide });
          const ring = new THREE.Mesh(ringGeom, ringMat);
          ring.rotation.x = -Math.PI/2; ring.position.copy(m.position).add(new THREE.Vector3(0, -0.45, 0));
          effectsGroup.add(ring);
          try { window.gsap?.to(ring.material, { opacity: 0, duration: 0.8, onComplete: ()=> effectsGroup.remove(ring) }); } catch { effectsGroup.remove(ring); }
        }
      }
    } catch {}
    document.getElementById('unit-action-panel')?.classList.remove('hidden');
  } catch {}
}
export function hideUnitActionPanel(){ try { document.getElementById('unit-action-panel')?.classList.add('hidden'); if (typeof window !== 'undefined') window.selectedUnit = null; } catch {} }

// Minimal prompt helpers (used by spells)
export function showPrompt(text, onCancel){
  try {
    const panel = document.getElementById('prompt-panel'); if (!panel) return;
    const t = document.getElementById('prompt-text'); if (t) t.textContent = text || '';
    panel.classList.remove('hidden');
    if (typeof window !== 'undefined') window.activePrompt = { text, onCancel };
  } catch {}
}
export function hidePrompt(){
  try {
    const panel = document.getElementById('prompt-panel'); if (panel) panel.classList.add('hidden');
    if (typeof window !== 'undefined') window.activePrompt = null;
  } catch {}
}

const api = { showOrientationPanel, hideOrientationPanel, showUnitActionPanel, hideUnitActionPanel, showPrompt, hidePrompt };
try { if (typeof window !== 'undefined') { window.__ui = window.__ui || {}; window.__ui.panels = api; } } catch {}
export default api;
