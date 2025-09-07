import { getCtx } from './context.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function performBattleSequence(r, c, markAttackTurn) {
  const ctx = getCtx();
  const { unitMeshes = [], tileMeshes = [] } = ctx;
  const THREE = ctx.THREE || (typeof window !== 'undefined' ? window.THREE : undefined);
  const gsap = typeof window !== 'undefined' ? window.gsap : undefined;
  let gameState = window.gameState;
  const staged = window.stagedAttack(gameState, r, c);
  if (!staged || staged.empty) return;
  await window.showBattleSplash();
  const aMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
  const hitsPrev = staged.targetsPreview || window.computeHits(gameState, r, c);

  const doStep1 = () => {
    staged.step1();
    gameState = staged.n1; window.gameState = gameState; window.updateUnits();
    for (const h of hitsPrev) {
      const tMesh = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (tMesh) {
        window.__fx.shakeMesh(tMesh, 6, 0.12);
        window.__fx.spawnDamageText(tMesh, `-${h.dmg}`, '#ff5555');
      }
    }
    setTimeout(async () => {
      await sleep(700);
      const ret = staged.step2() || { total: 0, retaliators: [] };
      const retaliation = typeof ret === 'number' ? ret : (ret.total || 0);
      let animDelayMs = 0;
      if (retaliation > 0) {
        const retaliators = ret.retaliators || [];
        let maxDur = 0;
        for (const rrObj of retaliators) {
          const rMesh = unitMeshes.find(m => m.userData.row === rrObj.r && m.userData.col === rrObj.c);
          const aMeshLive = unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || aMesh;
          if (rMesh && aMeshLive) {
            const dir2 = new THREE.Vector3().subVectors(aMeshLive.position, rMesh.position).normalize();
            const push2 = { x: dir2.x * 0.6, z: dir2.z * 0.6 };
            const tl2 = gsap.timeline();
            tl2.to(rMesh.position, { x: `+=${push2.x}`, z: `+=${push2.z}`, duration: 0.22, ease: 'power2.out' })
               .to(rMesh.position, { x: `-=${push2.x}`, z: `-=${push2.z}`, duration: 0.30, ease: 'power2.inOut' });
            maxDur = Math.max(maxDur, 0.52);
          }
        }
        setTimeout(() => {
          const aLive = unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || aMesh;
          if (aLive) {
            window.__fx.shakeMesh(aLive, 6, 0.14);
            window.__fx.spawnDamageText(aLive, `-${retaliation}`, '#ffd166');
          }
        }, Math.max(0, maxDur * 1000 - 10));
        animDelayMs = Math.max(animDelayMs, Math.floor(maxDur * 1000) + 160);
        try {
          const shouldSend = (typeof window !== 'undefined' && window.socket && window.NET_ACTIVE && window.MY_SEAT === gameState.active);
          if (shouldSend) {
            window.socket.emit('battleRetaliation', {
              attacker: { r, c },
              retaliators: retaliators.map(x => ({ r: x.r, c: x.c })),
              total: retaliation,
              bySeat: typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null
            });
          }
        } catch (e) { console.error('[battleRetaliation] Error sending battleRetaliation:', e); }
      }
      const res = staged.finish();
      if (res.deaths && res.deaths.length) {
        for (const d of res.deaths) {
          try { gameState.players[d.owner].graveyard.push(window.CARDS[d.tplId]); } catch {}
          const deadMesh = unitMeshes.find(m => m.userData.row === d.r && m.userData.col === d.c);
          if (deadMesh) {
            const fromMesh = aMesh || deadMesh;
            const dirUp = new THREE.Vector3().subVectors(deadMesh.position, fromMesh.position).normalize().multiplyScalar(0.4);
            window.__fx.dissolveAndAsh(deadMesh, dirUp, 0.9);
          }
          setTimeout(() => {
            const p = tileMeshes[d.r][d.c].position.clone().add(new THREE.Vector3(0, 1.6, 0));
            window.animateManaGainFromWorld(p, d.owner, true);
          }, 400);
        }
        setTimeout(() => {
          window.gameState = gameState = res.n1;
          window.updateUnits(); window.updateUI();
          for (const l of res.logLines.reverse()) window.addLog(l);
          if (markAttackTurn && window.gameState.board[r][c]?.unit) window.gameState.board[r][c].unit.lastAttackTurn = window.gameState.turn;
          try { window.schedulePush && window.schedulePush('battle-finish'); } catch {}
        }, 1000);
      } else {
        setTimeout(() => {
          window.gameState = gameState = res.n1;
          window.updateUnits(); window.updateUI();
          for (const l of res.logLines.reverse()) window.addLog(l);
          if (markAttackTurn && window.gameState.board[r][c]?.unit) window.gameState.board[r][c].unit.lastAttackTurn = window.gameState.turn;
          try { window.schedulePush && window.schedulePush('battle-finish'); } catch {}
        }, Math.max(0, animDelayMs));
      }
    }, 420);
  };

  if (aMesh && hitsPrev.length) {
    const firstTargetMesh = unitMeshes.find(m => m.userData.row === hitsPrev[0].r && m.userData.col === hitsPrev[0].c);
    if (firstTargetMesh) {
      const dir = new THREE.Vector3().subVectors(firstTargetMesh.position, aMesh.position).normalize();
      const push = { x: dir.x * 0.6, z: dir.z * 0.6 };
      const tl = gsap.timeline({ onComplete: doStep1 });
      tl.to(aMesh.position, { x: `+=${push.x}`, z: `+=${push.z}`, duration: 0.22, ease: 'power2.out' })
        .to(aMesh.position, { x: `-=${push.x}`, z: `-=${push.z}`, duration: 0.3, ease: 'power2.inOut' });
      try {
        const shouldSend = (typeof window !== 'undefined' && window.socket && window.NET_ACTIVE && window.MY_SEAT === gameState.active);
        if (shouldSend) {
          window.socket.emit('battleAnim', {
            attacker: { r, c },
            targets: hitsPrev.map(h => ({ r: h.r, c: h.c, dmg: h.dmg })),
            bySeat: typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null
          });
        }
      } catch (e) { console.error('[battleAnim] Error sending battleAnim:', e); }
    } else {
      gsap.to(aMesh.position, { y: aMesh.position.y + 0.25, yoyo: true, repeat: 1, duration: 0.2, onComplete: doStep1 });
    }
  } else {
    doStep1();
  }
}

export default { performBattleSequence };
