// Battle sequence animations and sync
// Extracted from inline script in index.html for modularity

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export async function showBattleSplash(){
  try {
    if (typeof document === 'undefined') return;
    window.splashActive = true; window.refreshInputLockUI?.();
    const bb = document.getElementById('battle-banner');
    if (!bb) { window.splashActive = false; window.refreshInputLockUI?.(); return; }
    bb.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'ts-wrap';
    const bg = document.createElement('div'); bg.className = 'ts-bg'; wrap.appendChild(bg);
    const ringOuter = document.createElement('div'); ringOuter.className = 'ts-ring thin'; wrap.appendChild(ringOuter);
    const ringInner = document.createElement('div'); ringInner.className = 'ts-ring'; wrap.appendChild(ringInner);
    const streaks = document.createElement('div'); streaks.className = 'ts-streaks'; wrap.appendChild(streaks);
    const txt = document.createElement('div'); txt.className = 'ts-title ts-title-solid text-6xl md:text-8xl'; txt.textContent = 'BATTLE'; wrap.appendChild(txt);
    const scan = document.createElement('div'); scan.className = 'ts-scan'; wrap.appendChild(scan);
    bb.appendChild(wrap);
    bb.style.display = 'flex'; bb.classList.remove('hidden'); bb.classList.add('flex');
    const tl = window.gsap?.timeline?.();
    if (tl) {
      tl.set(txt, { scale: 0.65, opacity: 0 })
        .set(ringOuter, { scale: 0.8, opacity: 0 })
        .set(ringInner, { scale: 0.5, opacity: 0 })
        .fromTo(bg, { opacity: 0 }, { opacity: 0.6, duration: 0.126, ease: 'power2.out' }, 0)
        .to(ringOuter, { opacity: 1, scale: 1.0, duration: 0.196, ease: 'back.out(2.2)' }, 0.014)
        .to(ringInner, { opacity: 1, scale: 1.0, duration: 0.224, ease: 'back.out(2.2)' }, 0.042)
        .to(txt, { opacity: 1, scale: 1.08, duration: 0.252, ease: 'back.out(1.9)' }, 0.056)
        .to(txt, { scale: 1.0, duration: 0.154, ease: 'power2.out' })
        .to(scan, { yPercent: 200, duration: 0.49, ease: 'power1.inOut' }, 0.084)
        .to(streaks, { opacity: 0.25, duration: 0.35 }, 0.14)
        .to([ringOuter, ringInner], { opacity: 0.9, duration: 0.14 }, 0.315)
        .to([bg, streaks], { opacity: 0.12, duration: 0.266 }, 0.406)
        .to([txt, ringOuter, ringInner], { opacity: 0, duration: 0.196, ease: 'power2.in' }, 1.134)
        .to(bb, { opacity: 0, duration: 0.14, ease: 'power2.in' }, 1.19);
      await sleep(1330);
    } else {
      await sleep(1000);
    }
    bb.classList.add('hidden'); bb.classList.remove('flex'); bb.style.display = 'none';
    bb.style.opacity = ''; bb.innerHTML = '';
    window.splashActive = false; window.refreshInputLockUI?.();
  } catch {}
}

export async function performBattleSequence(r, c, markAttackTurn){
  const staged = window.stagedAttack(window.gameState, r, c);
  if (!staged || staged.empty) return;
  await showBattleSplash();
  const unitMeshes = window.unitMeshes || [];
  const tileMeshes = window.tileMeshes || [];
  const hitsPrev = staged.targetsPreview || window.computeHits(window.gameState, r, c);
  const aMesh = unitMeshes.find(m => m.userData.row === r && m.userData.col === c);
  const gsap = window.gsap; const THREE = window.THREE; const animateManaGainFromWorld = window.animateManaGainFromWorld;
  const doStep1 = () => {
    staged.step1();
    window.gameState = staged.n1; window.updateUnits?.();
    for (const h of hitsPrev) {
      const tMesh = unitMeshes.find(m => m.userData.row === h.r && m.userData.col === h.c);
      if (tMesh) {
        window.__fx?.shakeMesh(tMesh, 6, 0.12);
        window.__fx?.spawnDamageText(tMesh, `-${h.dmg}`, '#ff5555');
      }
    }
    setTimeout(async () => {
      await sleep(700);
      const ret = staged.step2() || { total:0, retaliators:[] };
      const retaliation = typeof ret === 'number' ? ret : (ret.total || 0);
      let animDelayMs = 0;
      if (retaliation > 0){
        const retaliators = ret.retaliators || [];
        let maxDur = 0;
        for (const rrObj of retaliators){
          const rMesh = unitMeshes.find(m => m.userData.row === rrObj.r && m.userData.col === rrObj.c);
          const aMeshLive = unitMeshes.find(m => m.userData.row === r && m.userData.col === c) || aMesh;
          if (rMesh && aMeshLive){
            const dir2 = new THREE.Vector3().subVectors(aMeshLive.position, rMesh.position).normalize();
            const push2 = { x: dir2.x*0.6, z: dir2.z*0.6 };
            const tl2 = gsap.timeline();
            tl2.to(rMesh.position,{ x:`+=${push2.x}`, z:`+=${push2.z}`, duration:0.22, ease:'power2.out'})
               .to(rMesh.position,{ x:`-=${push2.x}`, z:`-=${push2.z}`, duration:0.30, ease:'power2.inOut'});
            maxDur = Math.max(maxDur,0.52);
          }
        }
        setTimeout(()=>{
          const aLive = unitMeshes.find(m=>m.userData.row===r && m.userData.col===c) || aMesh;
          if(aLive){
            window.__fx?.shakeMesh(aLive,6,0.14);
            window.__fx?.spawnDamageText(aLive,`-${retaliation}`,'#ffd166');
          }
        }, Math.max(0, maxDur*1000 -10));
        animDelayMs = Math.max(animDelayMs, Math.floor(maxDur*1000)+160);
        try {
          const shouldSend = window.socket && window.NET_ACTIVE && window.MY_SEAT === window.gameState.active;
          if (shouldSend){
            window.socket.emit('battleRetaliation', {
              attacker:{r,c},
              retaliators: retaliators.map(x=>({r:x.r,c:x.c})),
              total:retaliation,
              bySeat: typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null
            });
          }
        } catch(e){ console.error('[battleRetaliation]', e); }
      }
      const res = staged.finish();
      if (res.deaths && res.deaths.length){
        for (const d of res.deaths){
          try { window.gameState.players[d.owner].graveyard.push(window.CARDS[d.tplId]); } catch {}
          const deadMesh = unitMeshes.find(m=>m.userData.row===d.r && m.userData.col===d.c);
          if (deadMesh){
            const fromMesh = aMesh || deadMesh;
            const dirUp = new THREE.Vector3().subVectors(deadMesh.position, fromMesh.position).normalize().multiplyScalar(0.4);
            window.__fx?.dissolveAndAsh(deadMesh, dirUp, 0.9);
          }
          setTimeout(()=>{
            const p = tileMeshes[d.r][d.c].position.clone().add(new THREE.Vector3(0,1.6,0));
            animateManaGainFromWorld?.(p, d.owner, true);
          },400);
        }
        setTimeout(()=>{
          window.gameState = res.n1; window.updateUnits?.(); window.updateUI?.();
          for (const l of res.logLines.reverse()) window.addLog?.(l);
          if (markAttackTurn && window.gameState.board[r][c]?.unit) window.gameState.board[r][c].unit.lastAttackTurn = window.gameState.turn;
          try { window.schedulePush?.('battle-finish'); } catch {}
        },1000);
      } else {
        setTimeout(()=>{
          window.gameState = res.n1; window.updateUnits?.(); window.updateUI?.();
          for (const l of res.logLines.reverse()) window.addLog?.(l);
          if (markAttackTurn && window.gameState.board[r][c]?.unit) window.gameState.board[r][c].unit.lastAttackTurn = window.gameState.turn;
          try { window.schedulePush?.('battle-finish'); } catch {}
        }, Math.max(0, animDelayMs));
      }
    },420);
  };

  if (aMesh && hitsPrev.length){
    const firstTargetMesh = unitMeshes.find(m=>m.userData.row===hitsPrev[0].r && m.userData.col===hitsPrev[0].c);
    if (firstTargetMesh){
      const dir = new THREE.Vector3().subVectors(firstTargetMesh.position, aMesh.position).normalize();
      const push = { x: dir.x*0.6, z: dir.z*0.6 };
      const tl = gsap.timeline({ onComplete: doStep1 });
      tl.to(aMesh.position,{ x:`+=${push.x}`, z:`+=${push.z}`, duration:0.22, ease:'power2.out'})
        .to(aMesh.position,{ x:`-=${push.x}`, z:`-=${push.z}`, duration:0.3, ease:'power2.inOut'});
      try {
        const shouldSend = window.socket && window.NET_ACTIVE && window.MY_SEAT === window.gameState.active;
        if (shouldSend){
          window.socket.emit('battleAnim', {
            attacker:{r,c},
            targets:hitsPrev.map(h=>({r:h.r,c:h.c,dmg:h.dmg})),
            bySeat: typeof window.MY_SEAT === 'number' ? window.MY_SEAT : null
          });
        }
      } catch(e){ console.error('[battleAnim]', e); }
    } else {
      gsap.to(aMesh.position,{ y:aMesh.position.y + 0.25, yoyo:true, repeat:1, duration:0.2, onComplete:doStep1 });
    }
  } else {
    doStep1();
  }
}

const api = { performBattleSequence, showBattleSplash };
try { if (typeof window !== 'undefined') { window.performBattleSequence = performBattleSequence; window.showBattleSplash = showBattleSplash; window.__scene = window.__scene || {}; window.__scene.battle = api; } } catch {}
export default api;
