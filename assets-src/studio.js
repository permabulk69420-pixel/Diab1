// Renders an asset three ways (in dungeon light, neutral inspection, close-up) and exports it as GLB.
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {SkeletonUtils} from 'three/examples/jsm/Addons.js';
import {buildBarrel} from './barrel.js';
import {buildSkeleton} from './skeleton.js';

const ASSETS = {
  barrel: {build: buildBarrel, focus: [0, .46, 0], close: [[.52, .98, .36], [.2, .8, .12]]},
  // Animated assets pose each view from a clip: [clip, time].
  skeleton: {build: buildSkeleton, focus: [0, .85, 0], far: 3.6, close: [[.55, 1.75, .75], [0, 1.45, 0]], poses: [['Walk', .85], ['Attack', .55], ['Idle', 1.2]]},
};
const params = new URLSearchParams(location.search), name = params.get('asset') || 'barrel', A = ASSETS[name];
const VW = 640, VH = 640, renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(1); renderer.setSize(VW * 3, VH);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);
const built = await A.build(), asset = built.isObject3D ? built : built.object, clips = built.animations || [];
const posed = i => {
  if (!A.poses) return i ? asset.clone() : asset;
  const o = SkeletonUtils.clone(asset), mixer = new THREE.AnimationMixer(o), [name, t] = A.poses[i];
  mixer.clipAction(clips.find(c => c.name === name)).play(); mixer.update(t); o.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); return o;
};
const floor = (color, rough) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({color, roughness: rough})); m.rotation.x = -Math.PI / 2; return m; };

// 1: as it will look in the cathedral (same fog, ambient, torch and lantern as the game).
const dungeon = new THREE.Scene(); dungeon.background = new THREE.Color(0x010101); dungeon.fog = new THREE.Fog(0x010101, 3.2, 19.7);
dungeon.add(new THREE.HemisphereLight(0x55607a, 0x1a120c, 1.1), floor(0x4a4540, .95), posed(0));
const torch = new THREE.PointLight(0xff9447, 16, 11, 2); torch.position.set(-1.1, 2.8, -.9); dungeon.add(torch);
const camA = new THREE.PerspectiveCamera(70, 1, .05, 50); camA.position.set(1.25, 1.6, 1.35); camA.lookAt(0, .45, 0);
const lantern = new THREE.PointLight(0xffd2a8, 15, 12, 1.5); lantern.position.set(.12, -.25, -.15); camA.add(lantern); dungeon.add(camA);
// 2 and 3: neutral light to judge the modelling and textures.
const studio = new THREE.Scene(); studio.background = new THREE.Color(0x585d63);
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3.2, 1.6);
studio.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a332c, .9), key, floor(0x77726c, .9), posed(1));
const studio2 = new THREE.Scene(); studio2.background = studio.background;
if (A.poses) { const k2 = key.clone(); studio2.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a332c, .9), k2, floor(0x77726c, .9), posed(2)); }
const camB = new THREE.PerspectiveCamera(35, 1, .05, 50), far = A.far || 2.8; camB.position.set(far * .55, 1.55 * far / 2.8 + (A.far ? .4 : 0), far * .62); camB.lookAt(...A.focus);
const camC = new THREE.PerspectiveCamera(35, 1, .01, 50); camC.position.set(...A.close[0]); camC.lookAt(...A.close[1]);

renderer.setScissorTest(true);
[[dungeon, camA], [studio, camB], A.poses ? [studio2, camB] : [studio, camC]].forEach(([s, c], i) => { renderer.setViewport(i * VW, 0, VW, VH); renderer.setScissor(i * VW, 0, VW, VH); renderer.render(s, c); });

let tris = 0; asset.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
window.__stats = {tris, meshes: asset.children.filter(o => o.isMesh).length, clips: clips.map(c => c.name)};
window.__exportGLB = async () => {
  const buf = await new GLTFExporter().parseAsync(asset, {binary: true, animations: clips});
  let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
window.__ready = true;
