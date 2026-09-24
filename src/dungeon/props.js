// Props made in assets-src/ and exported as GLBs to public/models/.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {rng, SOLID, ROOM, CELL, DIRS, toWorld} from './generate.js';

const models = new Map();
function model(name) {
  if (!models.has(name)) models.set(name, new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/' + name + '.glb')
    .then(g => { g.scene.updateMatrixWorld(true); return g.scene; })
    .catch(e => { console.warn('Could not load model ' + name, e); return null; }));
  return models.get(name);
}
export function preloadProps() { model('barrel'); }

export const BARREL_R = .31;
const WALL_GAP = .5;   // barrel centre to wall line: clears the plinth moulding

/** Clusters of 1-3 barrels against room walls, kept clear of doorways, stairs and furniture. */
export function placeBarrels(L) {
  const {size, grid, blocked, reserved, openings, stairs, rooms} = L, r = rng(L.seed ^ 0x3c6ef372), I = (x, y) => y * size + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const at = (x, y) => inside(x, y) ? grid[I(x, y)] : SOLID;
  const keep = new Uint8Array(size * size);
  const mark = (cx, cy, rad) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if (inside(x, y)) keep[I(x, y)] = 1; };
  for (const o of openings) for (let k = o.from; k < o.to; k++) {
    if (o.axis === 'x') { mark(o.line, k, 2); mark(o.line - 1, k, 2); } else { mark(k, o.line, 2); mark(k, o.line - 1, 2); }
  }
  for (const s of [stairs.up, stairs.down]) if (s) { mark(s.x, s.y, 3); mark(s.x + 1, s.y + 1, 3); mark(Math.floor(s.spawn.x), Math.floor(s.spawn.y), 2); }
  const free = (x, y) => {
    if (at(x, y) !== ROOM || blocked[I(x, y)] || reserved[I(x, y)] || keep[I(x, y)]) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy) && blocked[I(x + dx, y + dy)]) return false;
    return true;
  };
  const out = [], order = rooms.map(R => ({R, k: r()})).sort((a, b) => a.k - b.k).map(e => e.R);
  for (const R of order) {
    if (r() > .6) continue;
    const cand = [];
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++)
      if (free(x, y)) for (const d of DIRS) if (at(x + d.x, y + d.y) === SOLID) cand.push({x, y, d});
    if (!cand.length) continue;
    const c = cand[Math.floor(r() * cand.length)], count = 1 + Math.floor(r() * r() * 3.2);
    const tx = c.d.y ? 1 : 0, ty = c.d.x ? 1 : 0, side = r() < .5 ? -1 : 1;
    for (let k = 0; k < count; k++) {
      const along = (k === 2 ? .33 : k * .66) * side + (r() - .5) * .08, out2 = k === 2 ? .6 : 0, off = CELL / 2 - WALL_GAP - out2;
      const x = toWorld(c.x + .5, size) + c.d.x * off + tx * along, z = toWorld(c.y + .5, size) + c.d.y * off + ty * along;
      if (!free(Math.floor(x / CELL + size / 2), Math.floor(z / CELL + size / 2))) break;
      out.push({x, z, yaw: r() * Math.PI * 2, s: .94 + r() * .12});
    }
  }
  return out;
}

/** Adds the barrels to `parent` as one instanced mesh per model part, once the GLB has loaded. */
export function addBarrels(parent, list) {
  if (!list.length) return;
  model('barrel').then(root => {
    if (!root) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    root.traverse(o => {
      if (!o.isMesh) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      list.forEach((b, i) => inst.setMatrixAt(i, m.compose(p.set(b.x, 0, b.z), q.setFromAxisAngle(up, b.yaw), s.setScalar(b.s)).multiply(o.matrixWorld)));
      inst.name = o.name; inst.renderOrder = o.material.transparent ? -1 : 0; inst.computeBoundingSphere();
      parent.add(inst);
    });
  });
}
