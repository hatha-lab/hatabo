// ハタボーイ（3D）を画面に出して、声に合わせて動かす。
// 使い方：import { mountHataboy } from './hataboy3d.js';
//   const hb = await mountHataboy(要素, { src: 'hataboy.glb' });
//   hb.setState('idle' | 'listen' | 'think' | 'talk');   hb.setLevel(0〜1)（話している声の大きさ）
// three.js はページの importmap で 'three' と 'three/addons/' を用意しておく。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function mountHataboy(el, opt = {}) {
  const W = () => el.clientWidth || 300, H = () => el.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;   // ツヤと金属の映りこみ
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(1.5, 2, 2.5); scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.01, 100);
  camera.position.set(0, 0, opt.distance || 3.4);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(opt.src || 'hataboy.glb');
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const fit = new THREE.Group(); fit.add(model); fit.scale.setScalar(1.6 / Math.max(size.x, size.y, size.z));
  if (opt.turn) fit.rotation.y = opt.turn;   // 正面の向きがちがうときに回す（ラジアン）
  const body = new THREE.Group(); body.add(fit); scene.add(body);

  let state = 'idle', level = 0, lv = 0, look = { x: 0, y: 0 }, alive = true;
  const clock = new THREE.Clock();
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); look.x = ((e.clientX - r.left) / r.width - 0.5) * 2; look.y = ((e.clientY - r.top) / r.height - 0.5) * 2; });
  el.addEventListener('pointerleave', () => { look.x = 0; look.y = 0; });
  new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); }).observe(el);

  function frame() {
    if (!alive) return;
    const t = clock.getElapsedTime();
    lv += (level - lv) * 0.35;
    const talk = state === 'talk' ? lv : 0;
    body.position.y = Math.sin(t * 1.6) * 0.05 + talk * 0.06;                     // ふわふわ浮く／話すと少しはずむ
    const tilt = state === 'listen' ? 0.14 : state === 'think' ? -0.1 : 0;          // 聞くときは首をかしげる・考えるときは逆へ
    body.rotation.z += ((tilt + Math.sin(t * 0.9) * 0.03) - body.rotation.z) * 0.08;
    body.rotation.y += ((look.x * 0.35 + (state === 'think' ? Math.sin(t * 2) * 0.15 : 0)) - body.rotation.y) * 0.08;
    body.rotation.x += ((look.y * 0.15) - body.rotation.x) * 0.08;
    const s = 1 + talk * 0.05 + Math.sin(t * 3.2) * 0.004;
    body.scale.set(s, 1 + talk * 0.08, s);                                          // 話すと縦にのびちぢみ
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  return {
    setState(s) { state = s; },
    setLevel(v) { level = Math.max(0, Math.min(1, v || 0)); },
    destroy() { alive = false; renderer.dispose(); el.removeChild(renderer.domElement); },
  };
}
