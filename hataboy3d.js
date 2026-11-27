// ハタボーイ（3D）を画面に出して、声に合わせて動かす。
// 使い方：import { mountHataboy } from './hataboy3d.js';
//   const hb = await mountHataboy(要素, { src: 'hataboy.glb', emblem: 'hataboy-emblem.webp' });
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
  let lastT = 0, fx = null;   // 話すときの光のつぶ（エンブレムがあるときだけ）
  // 胸のエンブレム：体の正面に光を当てて（レイ）胸のプレートの位置を見つけ、丸いシールのように貼る。体といっしょに動く
  if (opt.emblem) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(opt.emblem);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      body.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(fit), hgt = bb.max.y - bb.min.y;
      // 胸のプレートの真ん中（モデルで測った位置）。腕を上げているぶん、体の真ん中は箱の真ん中より少し左にある
      const cx = (bb.min.x + bb.max.x) / 2 + hgt * (opt.emblemX ?? -0.014), y = bb.min.y + hgt * (opt.emblemY || 0.305);
      const hit = new THREE.Raycaster(new THREE.Vector3(cx, y, 10), new THREE.Vector3(0, 0, -1)).intersectObject(fit, true)[0];
      if (hit) {
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(hgt * (opt.emblemR || 0.07), 48),
          new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.55, roughness: 0.28, polygonOffset: true, polygonOffsetFactor: -4 }));
        disc.position.copy(hit.point).addScaledVector(n, hgt * 0.004);
        disc.lookAt(disc.position.clone().add(n));
        body.add(disc);
        // 話すとき：エンブレムの真ん中へ、光のつぶ（素粒子）が吸いこまれるように集まる。声が大きいほど、多く・速く・明るく
        const R0 = hgt * (opt.emblemR || 0.07), N = 140;
        const dot = document.createElement('canvas'); dot.width = dot.height = 64;
        const g = dot.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(170,220,255,.8)'); gr.addColorStop(1, 'rgba(120,180,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const dotTex = new THREE.CanvasTexture(dot);
        const pos = new Float32Array(N * 3), pr = new Float32Array(N), pa = new Float32Array(N), ps = new Float32Array(N);
        const spawn = i => { pr[i] = R0 * (1.2 + Math.random() * 1.3); pa[i] = Math.random() * Math.PI * 2; ps[i] = 0.6 + Math.random() * 0.8; };
        for (let i = 0; i < N; i++) { spawn(i); pr[i] *= Math.random(); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pmat = new THREE.PointsMaterial({ map: dotTex, size: R0 * 0.32, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xbfe4ff });
        const cloud = new THREE.Points(geo, pmat); cloud.position.z = hgt * 0.006; disc.add(cloud);
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd8efff }));
        core.position.z = hgt * 0.008; disc.add(core);
        fx = (dt, v) => {   // v＝声の大きさ（0〜1）
          pmat.opacity += ((v > 0.02 ? 0.35 + v * 0.65 : 0) - pmat.opacity) * 0.15;
          const sp = R0 * (0.35 + v * 2.2) * dt;
          for (let i = 0; i < N; i++) {
            pr[i] -= sp * ps[i] * (1 + R0 / (pr[i] + R0 * 0.2) * 0.4);   // 真ん中に近いほど速く
            pa[i] += dt * (0.6 + v) * ps[i];                              // くるっと回りながら
            if (pr[i] < R0 * 0.05) spawn(i);
            pos[i * 3] = Math.cos(pa[i]) * pr[i]; pos[i * 3 + 1] = Math.sin(pa[i]) * pr[i]; pos[i * 3 + 2] = 0;
          }
          geo.attributes.position.needsUpdate = true;
          const c = v > 0.02 ? 0.5 + v * 0.5 : 0; core.material.opacity += (c - core.material.opacity) * 0.2;
          core.scale.setScalar(R0 * (0.6 + v * 1.4));
        };
      }
    } catch (e) { /* エンブレムが読めなくても、ハタボーイは出す */ }
  }

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
    if (fx) fx(Math.min(0.05, Math.max(0, t - lastT)), talk); lastT = t;
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
