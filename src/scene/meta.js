import { getCtx } from './context.js';
import { getCachedTexture, CARD_TEX } from './cards.js';

export let deckMeshes = [];
export let graveyardMeshes = [];

const META_Z_AWAY = 1.5;

export function createMetaObjects(gameState) {
  const ctx = getCtx();
  const { THREE, metaGroup } = ctx;
  if (!THREE || !metaGroup) return;

  // Очистка предыдущих
  deckMeshes.forEach(m => m.parent && m.parent.remove(m));
  graveyardMeshes.forEach(m => m.parent && m.parent.remove(m));
  deckMeshes = [];
  graveyardMeshes = [];
  if (!gameState) return;

  const baseX = (6.2 + 0.2) * 1 + 6.6;
  const zA = -5.2 - META_Z_AWAY;
  const zB = 0.2 + META_Z_AWAY;

  function buildDeck(player, z) {
    const g = new THREE.Group();
    g.position.set(baseX, 0.5, z);
    g.userData = { metaType: 'deck', player };
    const sideMap = (CARD_TEX && CARD_TEX.deckSide)
      ? CARD_TEX.deckSide
      : getCachedTexture('textures/card_deck_side_view.jpeg');
    const backMap = (CARD_TEX && CARD_TEX.back)
      ? CARD_TEX.back
      : getCachedTexture('textures/card_back_main.jpeg');
    const sideMat = new THREE.MeshStandardMaterial({
      map: sideMap,
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.85,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 5.0), sideMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData = { metaType: 'deck', player };
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(3.62, 0.04, 5.02),
      new THREE.MeshStandardMaterial({ map: backMap, color: 0xffffff })
    );
    top.position.y = 0.42;
    top.userData = { metaType: 'deck', player };
    g.add(body);
    g.add(top);
    metaGroup.add(g);
    deckMeshes.push(g);
  }

  function buildGrave(player, z) {
    const g = new THREE.Group();
    g.position.set(baseX + 4.2, 0.5, z);
    g.userData = { metaType: 'grave', player };
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    base.userData = { metaType: 'grave', player };
    const icon = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x64748b })
    );
    icon.position.y = 0.9;
    icon.rotation.y = Math.PI / 8;
    icon.userData = { metaType: 'grave', player };
    g.add(base);
    g.add(icon);
    metaGroup.add(g);
    graveyardMeshes.push(g);
  }

  buildDeck(0, zA);
  buildDeck(1, zB);
  buildGrave(0, zA);
  buildGrave(1, zB);
}
