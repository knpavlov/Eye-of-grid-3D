// Scene core: init THREE renderer/camera/scene and expose helpers
import { getCtx, setTHREE } from './context.js';

function ensureTHREE() {
  if (typeof window !== 'undefined' && window.THREE) {
    setTHREE(window.THREE);
    return window.THREE;
  }
  throw new Error('THREE not found on window. Load three.min.js before scene module.');
}

export function initThreeJS({ canvasId = 'three-canvas', clearColor = 0x0b1220 } = {}) {
  const ctx = getCtx();
  const THREE = ensureTHREE();
  const canvas = (typeof document !== 'undefined') ? document.getElementById(canvasId) : null;
  if (!canvas) throw new Error(`Canvas #${canvasId} not found`);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(clearColor);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = 1.08;

  // Scene
  const scene = new THREE.Scene();
  scene.fog = null;

  // Camera
  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 22, 13);
  camera.lookAt(0, 1.2, 0);

  // Picking
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Groups
  const boardGroup = new THREE.Group();
  const cardGroup = new THREE.Group();
  const effectsGroup = new THREE.Group();
  const metaGroup = new THREE.Group();
  scene.add(boardGroup, cardGroup, effectsGroup, metaGroup);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -15;
  directionalLight.shadow.camera.right = 15;
  directionalLight.shadow.camera.top = 15;
  directionalLight.shadow.camera.bottom = -15;
  scene.add(directionalLight);
  const hemi = new THREE.HemisphereLight(0xcadfff, 0x1a2a3a, 0.6);
  scene.add(hemi);

  // Platform
  const platformGeometry = new THREE.CylinderGeometry(32, 32, 0.7, 48);
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2332, metalness: 0.7, roughness: 0.3 });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.y = -0.35;
  platform.receiveShadow = true;
  scene.add(platform);

  // Save in context
  ctx.renderer = renderer;
  ctx.scene = scene;
  ctx.camera = camera;
  ctx.raycaster = raycaster;
  ctx.mouse = mouse;
  ctx.boardGroup = boardGroup;
  ctx.cardGroup = cardGroup;
  ctx.effectsGroup = effectsGroup;
  ctx.metaGroup = metaGroup;

  // Convenience exposure for debugging and legacy access
  try {
    window.renderer = renderer;
    window.scene = scene;
    window.camera = camera;
    window.boardGroup = boardGroup;
    window.cardGroup = cardGroup;
    window.effectsGroup = effectsGroup;
    window.metaGroup = metaGroup;
    window.raycaster = raycaster;
    window.mouse = mouse;
  } catch {}

  // Resize handler
  function onWindowResize() {
    try {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    } catch {}
  }
  window.addEventListener('resize', onWindowResize);

  return ctx;
}

export function worldToScreen(vec3) {
  const { camera, renderer, THREE } = getCtx();
  if (!camera || !renderer || !vec3) return { x: 0, y: 0 };
  const v = vec3.clone().project(camera);
  const x = (v.x + 1) / 2 * renderer.domElement.clientWidth;
  const y = (1 - v.y) / 2 * renderer.domElement.clientHeight;
  return { x, y };
}

export function animate() {
  const { renderer, scene, camera } = getCtx();
  if (!renderer || !scene || !camera) return;
  function loop() {
    try { renderer.render(scene, camera); } catch {}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

