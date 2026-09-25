// Optimises Kane's skeleton warrior (assets-src/source/skeleton_warrior.glb) for Quest:
// 22 per-bone meshes become 3 skinned meshes (bone, metal, leather) on the same bones, so the
// Idle/Walk/Attack/Death clips play unchanged; dense parts are simplified, grime is baked into
// the vertex colours, and the sword is brought down to a one-handed size.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {mergeGeometries, mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {noise2} from './lib/tex.js';

const SWORD_SCALE = .82;
// Share of triangles to keep on the dense parts; everything else is left as authored.
const KEEP = {Head: .28, Pelvis: .3, R_Hand: .4, L_Forearm: .4, R_Foot: .6, L_Foot: .6};
const GROUP_OF = {'Aged ivory bone': 'bone', 'Forged steel': 'metal', 'Dark iron fittings': 'metal', 'Oxblood leather': 'leather', 'Leather winding': 'leather'};

function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

/** Ambient occlusion baked into COLOR_0: short rays from each vertex through a voxelised copy of
 *  the whole skeleton, so ribs, eye sockets, pelvis and joints darken where they tuck in. Adds
 *  brownish dirt in the occluded areas, faint stains, and muddier feet. */
function bakeGrime(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, n = pos.count;
  g.computeBoundingBox();
  const V = .012, min = g.boundingBox.min.clone().subScalar(V * 12), size = g.boundingBox.getSize(new THREE.Vector3()).addScalar(V * 24);
  const nx = Math.ceil(size.x / V), ny = Math.ceil(size.y / V), nz = Math.ceil(size.z / V), grid = new Uint8Array(nx * ny * nz);
  const cell = (x, y, z) => { const i = Math.floor((x - min.x) / V), j = Math.floor((y - min.y) / V), k = Math.floor((z - min.z) / V); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const idx = g.index ? g.index.array : null, triN = idx ? idx.length / 3 : n / 3;
  for (let t = 0; t < triN; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const steps = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (V * .5)));
    for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
      p.copy(a).multiplyScalar(1 - (u + v) / steps).addScaledVector(b, u / steps).addScaledVector(c, v / steps);
      const q = cell(p.x, p.y, p.z); if (q >= 0) grid[q] = 1;
    }
  }
  // Fixed ray set over the sphere; each vertex uses the ones in its normal's hemisphere.
  const dirs = []; for (let i = 0; i < 40; i++) { const y = 1 - (i + .5) / 20, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.39996; if (Math.abs(y) <= 1) dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)); }
  const N = new THREE.Vector3(), n1 = noise2(91), n2 = noise2(92), REACH = .11;
  for (let i = 0; i < n; i++) {
    a.fromBufferAttribute(pos, i); N.fromBufferAttribute(nor, i).normalize();
    let hit = 0, total = 0;
    for (const d of dirs) {
      const w = d.dot(N); if (w <= .05) continue; total += w;
      for (let s = V * 1.6; s < REACH; s += V * .8) {
        p.copy(a).addScaledVector(N, V * .9).addScaledVector(d, s);
        const q = cell(p.x, p.y, p.z);
        if (q >= 0 && grid[q]) { hit += w * (1 - s / REACH * .5); break; }
      }
    }
    const ao = total ? 1 - hit / total : 1, occl = Math.pow(1 - ao, .8);
    const stain = Math.max(0, n1(a.x * 9 + 40, a.y * 9 + a.z * 5) - .45) * 1.4, mud = THREE.MathUtils.clamp(1 - a.y / .45, 0, 1) ** 2;
    const k = (1 - occl * .72) * (1 - mud * .35) * (.93 + n2(a.x * 25 + a.z * 13, a.y * 25) * .1) * .9;
    const warm = occl * .5 + stain * .3;                                // dirt collects in the dark areas
    col.setXYZ(i, col.getX(i) * k * (1 - warm * .05), col.getY(i) * k * (1 - warm * .16), col.getZ(i) * k * (1 - warm * .33));
  }
  return g;
}

export async function buildSkeleton() {
  const gltf = await new GLTFLoader().loadAsync(new URL('./source/skeleton_warrior.glb', import.meta.url).href);
  const src = gltf.scene, assoc = gltf.parser.associations, isNode = o => assoc.get(o)?.nodes !== undefined;
  src.getObjectByName('Sword').scale.setScalar(SWORD_SCALE);           // baked into the vertices below
  src.updateMatrixWorld(true);

  // Bones mirror the node hierarchy with the same names, so the original clips drive them.
  const bones = [], boneOf = new Map();
  const makeBone = o => {
    const b = new THREE.Bone(); b.name = o.name; b.position.copy(o.position); b.quaternion.copy(o.quaternion);
    boneOf.set(o, b); bones.push(b);
    for (const c of o.children) if (isNode(c)) b.add(makeBone(c));
    return b;
  };
  const rootNode = src.children.find(isNode), rootBone = makeBone(rootNode);

  const parts = {bone: [], metal: [], leather: []}, stats = {before: 0, after: 0};
  const simplifier = new SimplifyModifier(), base = new THREE.Color();
  src.traverse(m => {
    if (!m.isMesh) return;
    const owner = isNode(m) ? m : m.parent, boneIndex = bones.indexOf(boneOf.get(owner)), ownerName = owner.name;
    let g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    if (g.attributes.color.itemSize === 4) { const c = g.attributes.color, a = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { a[i * 3] = c.getX(i); a[i * 3 + 1] = c.getY(i); a[i * 3 + 2] = c.getZ(i); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    stats.before += triCount(g);
    if (KEEP[ownerName]) {
      const t0 = triCount(g); g = mergeVertices(g, 1e-5);
      const remove = Math.floor(g.attributes.position.count * (1 - KEEP[ownerName]));
      g = simplifier.modify(g, remove); if (!g.index) g = mergeVertices(g, 1e-6);
      console.log(ownerName, t0, '->', triCount(g));
    }
    g.applyMatrix4(m.matrixWorld);                                     // keeps the repaired normals
    base.copy(m.material.color);                                        // bake the material colour
    const col = g.attributes.color; for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * base.r, col.getY(i) * base.g, col.getZ(i) * base.b);
    const cnt = g.attributes.position.count, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let i = 0; i < cnt; i++) { si[i * 4] = boneIndex; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    parts[GROUP_OF[m.material.name] || 'bone'].push(g.index ? g.toNonIndexed() : g);
  });
  boneOf.get(src.getObjectByName('Sword')).scale.setScalar(1);

  const root = new THREE.Group(); root.name = 'SkeletonWarrior'; root.add(rootBone); root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mats = {
    bone: new THREE.MeshStandardMaterial({name: 'Bone', vertexColors: true, roughness: .78, metalness: 0}),
    metal: new THREE.MeshStandardMaterial({name: 'Metal', vertexColors: true, roughness: .32, metalness: .9}),
    leather: new THREE.MeshStandardMaterial({name: 'Leather', vertexColors: true, roughness: .88, metalness: 0}),
  };
  for (const [name, list] of Object.entries(parts)) {
    if (!list.length) continue;
    let g = mergeVertices(mergeGeometries(list), 1e-6);
    if (name === 'bone') g = bakeGrime(g);
    stats.after += triCount(g);
    const mesh = new THREE.SkinnedMesh(g, mats[name]); mesh.name = 'Skeleton' + name[0].toUpperCase() + name.slice(1);
    root.add(mesh); mesh.bind(skeleton, mesh.matrixWorld);
  }
  console.log('skeleton tris', stats.before, '->', stats.after);
  return {object: root, animations: gltf.animations, stats};
}
