// Common UI action helpers: unit rotation and attacks
import * as fx from '../scene/effects.js';

export function rotateUnit(unitMesh, dir) {
  if (!unitMesh || typeof window === 'undefined') return;
  const u = unitMesh.userData.unitData;
  if (!u) return;
  const { gameState, CARDS, attackCost, turnCW, turnCCW } = window;
  const { showNotification, updateUI } = window.__ui || {};
  if (u.owner !== gameState.active) { showNotification && showNotification("You can't rotate the other player's unit", 'error'); return; }
  if (u.lastRotateTurn === gameState.turn) { showNotification && showNotification('The unit has already rotated in this turn', 'error'); return; }
  const tpl = CARDS[u.tplId];
  const cost = attackCost(tpl);
  if (gameState.players[gameState.active].mana < cost) { showNotification && showNotification(`${cost} mana is required to rotate`, 'error'); return; }
  gameState.players[gameState.active].mana -= cost; updateUI && updateUI();
  u.facing = dir === 'cw' ? turnCW[u.facing] : turnCCW[u.facing];
  u.lastRotateTurn = gameState.turn;
  window.updateUnits && window.updateUnits();
  window.selectedUnit = null;
  try { window.__ui?.panels?.hideUnitActionPanel(); } catch {}
}

export function performUnitAttack(unitMesh) {
  if (!unitMesh || typeof window === 'undefined') return;
  const { gameState, CARDS, attackCost } = window;
  const { showNotification, updateUI, panels } = window.__ui || {};
  const r = unitMesh.userData.row; const c = unitMesh.userData.col;
  const unit = gameState.board[r][c].unit; if (!unit) return;
  const tpl = CARDS[unit.tplId];
  const cost = attackCost(tpl);
  if (tpl.attackType === 'MAGIC') {
    if (gameState.players[gameState.active].mana < cost) { showNotification && showNotification(`${cost} mana is required to attack`, 'error'); return; }
    gameState.players[gameState.active].mana -= cost;
    updateUI && updateUI();
    window.selectedUnit = null;
    try { panels?.hideUnitActionPanel(); } catch {}
    window.magicFrom = { r, c };
    window.addLog && window.addLog(`${tpl.name}: select a target for the magical attack.`);
    return;
  }
  const hits = window.computeHits ? window.computeHits(gameState, r, c) : [];
  if (!hits.length) { showNotification && showNotification('No available targets for attack', 'error'); return; }
  if (gameState.players[gameState.active].mana < cost) { showNotification && showNotification(`${cost} mana is required to attack`, 'error'); return; }
  gameState.players[gameState.active].mana -= cost;
  updateUI && updateUI();
  window.selectedUnit = null;
  try { panels?.hideUnitActionPanel(); } catch {}
  performBattleSequence(r, c, true);
}

export async function performBattleSequence(r, c, markAttackTurn) {
  if (typeof window === 'undefined') return;
  const {
    stagedAttack, computeHits, tileMeshes, unitMeshes,
    addLog, updateUnits, updateUI, animateManaGainFromWorld,
    CARDS, gameState, sleep = (ms)=>new Promise(res=>setTimeout(res,ms))
  } = window;
  const staged = stagedAttack(gameState, r, c);
  if (!staged || staged.empty) return;
  await window.showBattleSplash?.();
  const aMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
  const hitsPrev = (staged.targetsPreview || computeHits(gameState, r, c));
  const doStep1 = () => {
    staged.step1();
    window.gameState = staged.n1; updateUnits();
    for (const h of hitsPrev) {
      const tMesh = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (tMesh) {
        fx.shakeMesh(tMesh, 6, 0.12);
        fx.spawnDamageText(tMesh, `-${h.dmg}`, '#ff5555');
      }
    }
    setTimeout(async () => {
      await sleep(700);
      const ret = staged.step2() || { total: 0, retaliators: [] };
      const retaliation = typeof ret === 'number' ? ret : (ret.total || 0);
      let animDelayMs = 0;
      if (retaliation > 0) {
        const retaliators = (ret.retaliators || []);
        let maxDur = 0;
        for (const rrObj of retaliators) {
          const rMesh = unitMeshes.find(m => m.userData.row === rrObj.r && m.userData.col === rrObj.c);
          const aMeshLive = unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || aMesh;
          if (rMesh && aMeshLive) {
            const dir2 = new window.THREE.Vector3().subVectors(aMeshLive.position, rMesh.position).normalize();
            const push2 = { x: dir2.x * 0.6, z: dir2.z * 0.6 };
            const tl2 = window.gsap.timeline();
            tl2.to(rMesh.position, { x: `+=${push2.x}`, z: `+=${push2.z}`, duration: 0.22, ease: 'power2.out' })
               .to(rMesh.position, { x: `-=${push2.x}`, z: `-=${push2.z}`, duration: 0.30, ease: 'power2.inOut' });
            maxDur = Math.max(maxDur, 0.52);
          }
        }
        setTimeout(() => {
          const aLive = unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || aMesh;
          if (aLive) {
            fx.shakeMesh(aLive, 6, 0.14);
            fx.spawnDamageText(aLive, `-${retaliation}`, '#ffd166');
          }
        }, Math.max(0, maxDur * 1000 - 10));
        animDelayMs = Math.max(animDelayMs, Math.floor(maxDur * 1000) + 160);
      }
      const res = staged.finish();
      if (res.deaths && res.deaths.length) {
        for (const d of res.deaths) {
          try { gameState.players[d.owner].graveyard.push(CARDS[d.tplId]); } catch {}
          const deadMesh = unitMeshes.find(m => m.userData.row === d.r && m.userData.col === d.c);
          if (deadMesh) {
            const fromMesh = aMesh || deadMesh;
            const dirUp = new window.THREE.Vector3().subVectors(deadMesh.position, fromMesh.position).normalize().multiplyScalar(0.4);
            fx.dissolveAndAsh(deadMesh, dirUp, 0.9);
          }
          setTimeout(() => {
            const p = tileMeshes[d.r][d.c].position.clone().add(new window.THREE.Vector3(0, 1.6, 0));
            animateManaGainFromWorld(p, d.owner, true);
          }, 400);
        }
        setTimeout(() => {
          window.gameState = res.n1; updateUnits(); updateUI();
          for (const l of res.logLines.reverse()) addLog(l);
          if (markAttackTurn && gameState.board[r][c]?.unit) gameState.board[r][c].unit.lastAttackTurn = gameState.turn;
          try { window.schedulePush?.('battle-finish'); } catch {}
        }, 1000);
      } else {
        setTimeout(() => {
          window.gameState = res.n1; updateUnits(); updateUI();
          for (const l of res.logLines.reverse()) addLog(l);
          if (markAttackTurn && gameState.board[r][c]?.unit) gameState.board[r][c].unit.lastAttackTurn = gameState.turn;
          try { window.schedulePush?.('battle-finish'); } catch {}
        }, Math.max(0, animDelayMs));
      }
    }, 420);
  };

  if (aMesh && hitsPrev.length) {
    const firstTargetMesh = unitMeshes.find(m => m.userData.row === hitsPrev[0].r && m.userData.col === hitsPrev[0].c);
    if (firstTargetMesh) {
      const dir = new window.THREE.Vector3().subVectors(firstTargetMesh.position, aMesh.position).normalize();
      const push = { x: dir.x * 0.6, z: dir.z * 0.6 };
      const tl = window.gsap.timeline({ onComplete: doStep1 });
      tl.to(aMesh.position, { x: `+=${push.x}`, z: `+=${push.z}`, duration: 0.22, ease: 'power2.out' })
        .to(aMesh.position, { x: `-=${push.x}`, z: `-=${push.z}`, duration: 0.3, ease: 'power2.inOut' });
    } else {
      window.gsap.to(aMesh.position, { y: aMesh.position.y + 0.25, yoyo: true, repeat: 1, duration: 0.2, onComplete: doStep1 });
    }
  } else {
    doStep1();
  }
}
