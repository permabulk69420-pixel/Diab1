import * as THREE from 'three';
import {Builder} from '../geometry.js';
import {CELL, SOLID, HALL, DIRS, toWorld, rng} from './generate.js';

export const WALL_H = 4.4;       // floor to vault
export const T = .5;             // visible wall slab thickness (inset into the solid side)
export const STAIR_RISE = 1.6;   // how far the stair ramps climb/descend inside their alcove
const PIT = -2.4;                // bottom of the down-stair pit

// Pointed-arch lintel: one closed outline, solid everywhere except the doorway.
function archOutline(w, h, aw, spring, apex, bottom = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, bottom); s.lineTo(-aw / 2, bottom); s.lineTo(-aw / 2, spring);
  s.bezierCurveTo(-aw / 2, spring + (apex - spring) * .55, -aw * .2, apex - .04, 0, apex);
  s.bezierCurveTo(aw * .2, apex - .04, aw / 2, spring + (apex - spring) * .55, aw / 2, spring);
  s.lineTo(aw / 2, bottom); s.lineTo(w / 2, bottom); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  return s;
}
function intrados(aw, spring, apex) {
  const p = new THREE.Path();
  p.moveTo(-aw / 2, spring);
  p.bezierCurveTo(-aw / 2, spring + (apex - spring) * .55, -aw * .2, apex - .04, 0, apex);
  p.bezierCurveTo(aw * .2, apex - .04, aw / 2, spring + (apex - spring) * .55, aw / 2, spring);
  return p.getPoints(7);
}
/** Lintel wall with a pointed opening, in the current b.at() frame, centred on local z=zc. */
function archWall(b, w, aw, spring, apex, bottom, zc, tint) {
  const g = new THREE.ExtrudeGeometry(archOutline(w, WALL_H, aw, spring, apex, bottom), {depth: T, bevelEnabled: false, curveSegments: 6});
  g.translate(0, 0, -T / 2);
  b.add(g, 'ashlar', 0, 0, zc, 1, 1, 1, 0, 0, 0, tint, [.5, .5]); g.dispose();
  // Voussoir ribs on both faces and a keystone.
  const pts = intrados(aw, spring, apex);
  for (const face of [-1, 1]) {
    for (let i = 1; i < pts.length; i++) b.beam('stone', [pts[i - 1].x, pts[i - 1].y, zc + face * (T / 2 + .02)], [pts[i].x, pts[i].y, zc + face * (T / 2 + .02)], .09, tint);
    for (const x of [-aw / 2, aw / 2]) b.box('stone', x, (bottom + spring) / 2, zc + face * (T / 2 + .02), .2, spring - bottom, .1, 0, tint);
    b.box('stone', 0, apex + .12, zc + face * (T / 2 + .03), .3, .38, .14, 0, tint);
  }
}

export const DOOR_CHANCE = .6;   // share of archways that get a pair of wooden doors
export const HINGE_IN = .06;     // hinges sit just inside the jambs so open leaves clear the stone ribs

/** One wooden door leaf following half of the pointed arch; hinge at the local origin.
 *  side = 1 extends toward +x (left leaf), side = -1 toward -x (right leaf). */
function doorLeaf(materials, side, aw, spring, apex) {
  const b = new Builder(materials), lw = aw / 2 - HINGE_IN - .015, D = .09, X = v => side * v;
  const s = new THREE.Shape();
  s.moveTo(0, .02); s.lineTo(0, spring - .02);
  s.bezierCurveTo(0, spring + (apex - spring) * .5, X(lw * .6), apex - .08, X(lw), apex - .1);
  s.lineTo(X(lw), .02); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth: D, bevelEnabled: false, curveSegments: 6});
  g.translate(0, 0, -D / 2);
  b.add(g, 'darkwood', 0, 0, 0, 1, 1, 1, 0, 0, 0, new THREE.Color(.8, .72, .64), [.5, .5]); g.dispose();
  for (const face of [-1, 1]) {
    const fz = face * (D / 2 + .004);
    // Plank seams, stopping short of the curved top.
    for (let k = 1; k < 4; k++) { const hh = spring - .12 + (apex - spring) * k / 4 * .75; b.box('darkwood', X(lw * k / 4), hh / 2 + .03, fz, .025, hh, .008, 0, new THREE.Color(.3, .26, .22)); }
    // Iron straps with hinge knuckles.
    for (const y of [.45, 1.35, 2.25]) {
      b.box('iron', X(lw * .45), y, face * (D / 2 + .012), lw * .9, .09, .02);
      for (const k of [.3, .6]) b.box('iron', X(lw * k), y, face * (D / 2 + .025), .035, .035, .012);
    }
    // Ring pull on its backplate near the meeting edge.
    b.box('iron', X(lw - .2), 1.28, face * (D / 2 + .012), .12, .16, .016);
    const ring = new THREE.TorusGeometry(.075, .013, 5, 12); b.add(ring, 'iron', X(lw - .2), 1.2, face * (D / 2 + .035)); ring.dispose();
  }
  for (const y of [.45, 1.35, 2.25]) b.cylinder('iron', 0, y, 0, .035, .035, .16, 6);
  return b.finish();
}

export function buildLevel(L, materials) {
  const {size, grid} = L, r = rng(L.seed ^ 0x5bd1e995);
  const b = new Builder(materials);
  const I = (x, y) => y * size + x;
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size) ? SOLID : grid[I(x, y)];
  const W = g => toWorld(g, size);
  const tint = (lo = .78, hi = 1) => new THREE.Color().setScalar(lo + r() * (hi - lo));
  const ang = d => Math.atan2(-d.x, -d.y);   // yaw whose local -Z points along d

  // Which cells are stairs, and which wall edges the stair alcoves replace.
  const stairCells = new Map(), skipEdge = new Set();
  for (const s of [L.stairs.up, L.stairs.down]) {
    if (!s) continue;
    for (let y = s.y; y < s.y + 2; y++) for (let x = s.x; x < s.x + 2; x++) {
      stairCells.set(I(x, y), s);
      if (at(x + s.dir.x, y + s.dir.y) === SOLID) skipEdge.add(I(x, y) + ':' + DIRS.findIndex(d => d.x === s.dir.x && d.y === s.dir.y));
    }
  }

  // --- floors and vault --------------------------------------------------------
  const h = CELL / 2, F = a => new THREE.Float32BufferAttribute(a, 3);
  function tile(mat, cx, cz, y, down, t) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', F([-h, 0, -h, h, 0, -h, -h, 0, h, h, 0, h]));
    const n = down ? -1 : 1; g.setAttribute('normal', F([0, n, 0, 0, n, 0, 0, n, 0, 0, n, 0]));
    const u0 = (cx - h) / 4, u1 = (cx + h) / 4, v0 = (cz - h) / 4, v1 = (cz + h) / 4;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u0, v1, u1, v1], 2));
    g.setIndex(down ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 1, 2, 3]);
    b.add(g, mat, cx, y, cz, 1, 1, 1, 0, 0, 0, t); g.dispose();
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (at(x, y) === SOLID) continue;
    const cx = W(x + .5), cz = W(y + .5);
    if (!stairCells.has(I(x, y))) tile('flag', cx, cz, 0, false, tint(.72, 1));
    tile('vault', cx, cz, WALL_H, true, tint(.7, .9));
  }

  // --- walls: thin slabs on the solid side of every floor/solid boundary --------
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (at(x, y) === SOLID) continue;
    for (let di = 0; di < 4; di++) {
      const d = DIRS[di];
      if (at(x + d.x, y + d.y) !== SOLID || skipEdge.has(I(x, y) + ':' + di)) continue;
      const tx = d.y ? 1 : 0, ty = d.x ? 1 : 0;
      // Fill concave corners by stretching into them; convex jambs (doorways) stay clean.
      const extA = at(x - tx, y - ty) === SOLID ? T : 0, extB = at(x + tx, y + ty) === SOLID ? T : 0;
      const len = CELL + extA + extB, shift = (extB - extA) / 2;
      const cx = W(x + .5), cz = W(y + .5), t = tint(.72, 1);
      const off = CELL / 2 + T / 2;
      const px = cx + d.x * off + tx * shift, pz = cz + d.y * off + ty * shift;
      b.box('ashlar', px, WALL_H / 2, pz, d.x ? T : len, WALL_H, d.x ? len : T, 0, t);
      // Plinth and cornice mouldings on the room face.
      const face = CELL / 2, pl = CELL + (extA ? .16 : 0) + (extB ? .16 : 0), ps = ((extB ? .16 : 0) - (extA ? .16 : 0)) / 2;
      for (const [yy, hh, dd, k] of [[.2, .4, .16, .62], [WALL_H - .28, .22, .24, .85], [WALL_H - .08, .16, .14, .7]]) {
        const o = face - dd / 2;
        b.box('ashlar', cx + d.x * o + tx * ps, yy, cz + d.y * o + ty * ps, d.x ? dd : pl, hh, d.x ? pl : dd, 0, t.clone().multiplyScalar(k));
      }
    }
  }

  // --- pointed arches wherever a hall meets a room -----------------------------
  // Centre, yaw and clear width of the arch where a hall meets a room.
  const archFrame = o => {
    const w = (o.to - o.from) * CELL, mid = W((o.from + o.to) / 2), line = W(o.line) + o.sign * T / 2;
    return {w, aw: w - .7, x: o.axis === 'x' ? line : mid, z: o.axis === 'x' ? mid : line, yaw: o.axis === 'x' ? Math.PI / 2 : 0};
  };
  for (const o of L.openings) {
    const {w, aw, x, z, yaw} = archFrame(o), t = tint(.8, 1);
    b.at(x, 0, z, yaw, () => {
      archWall(b, w, aw, 2.75, 3.9, 0, 0, t);
      for (const s of [-1, 1]) b.collider(.35, T, s * (aw / 2 + .175), 0);
    });
  }

  // --- ribbed vaults -------------------------------------------------------------
  const rib = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = Math.abs(x1 - x0), lz = Math.abs(z1 - z0); b.box('ashlar', cx, WALL_H - .18, cz, lx || .34, .36, lz || .34, 0, tint(.6, .75)); };
  for (const R of L.rooms) {
    const px = [...new Set(L.pillars.filter(p => p.room === R.id).map(p => p.x))];
    const pz = [...new Set(L.pillars.filter(p => p.room === R.id).map(p => p.y))];
    const x0 = W(R.x), x1 = W(R.x + R.w), z0 = W(R.y), z1 = W(R.y + R.h);
    if (px.length) { for (const g of px) rib(W(g), z0, W(g), z1); for (const g of pz) rib(x0, W(g), x1, W(g)); }
    else if (R.w >= R.h) { for (let g = R.x + 2; g < R.x + R.w - 1; g += 2) rib(W(g), z0, W(g), z1); }
    else { for (let g = R.y + 2; g < R.y + R.h - 1; g += 2) rib(x0, W(g), x1, W(g)); }
  }
  for (const H of L.halls) {
    if (H.w === 2) for (let g = H.y + 1; g < H.y + H.h; g++) rib(W(H.x), W(g), W(H.x + 2), W(g));
    else for (let g = H.x + 1; g < H.x + H.w; g++) rib(W(g), W(H.y), W(g), W(H.y + 2));
  }

  // --- nave pillars --------------------------------------------------------------
  for (const p of L.pillars) {
    const x = W(p.x), z = W(p.y), t = tint(.75, .95);
    b.box('ashlar', x, .2, z, 1.05, .4, 1.05, 0, t.clone().multiplyScalar(.8));
    b.box('ashlar', x, .5, z, .86, .22, .86, 0, t);
    const shaft = new THREE.CylinderGeometry(.36, .4, WALL_H - .9, 8);
    b.add(shaft, 'ashlar', x, WALL_H / 2 - .02, z, 1, 1, 1, 0, Math.PI / 8, 0, t, [1.3, 2]); shaft.dispose();
    b.box('ashlar', x, WALL_H - .52, z, .9, .22, .9, 0, t);
    b.box('ashlar', x, WALL_H - .33, z, 1.08, .18, 1.08, 0, t.clone().multiplyScalar(.85));
    b.colliders.push({type: 'circle', x, z, r: .52});
  }

  // --- stairs set into wall alcoves ------------------------------------------------
  for (const s of [L.stairs.up, L.stairs.down]) {
    if (!s) continue;
    const down = s.kind === 'down', n = 6, depth = 4 / n;
    b.at(W(s.x + 1), 0, W(s.y + 1), ang(s.dir), () => {
      const t = tint(.75, .9);
      // Steps (front of the alcove is local +z, the wall is at local z = -2).
      for (let i = 0; i < n + 3; i++) {
        const top = (down ? -1 : 1) * Math.min(i + 1, n + 3) * STAIR_RISE / n;
        const z = 2 - (i + .5) * depth, bottom = down ? PIT : 0;
        b.box('flag', 0, (top + bottom) / 2, z, i < n ? 4 : 3.1, Math.abs(top - bottom) + .001, depth + .01, 0, tint(.55, .8));
        b.box('stone', 0, top - .03, z + depth / 2 - .04, i < n ? 3.95 : 3.05, .07, .1, 0, t); // worn nosing
      }
      // Balustrade walls on both sides (the only colliders: the back is solid grid).
      for (const side of [-1, 1]) {
        const lo = down ? PIT : 0, hi = down ? .95 : STAIR_RISE + .95;
        b.box('ashlar', side * 1.82, (lo + hi) / 2, 0, .36, hi - lo, 4, 0, t);
        b.box('stone', side * 1.82, hi + .06, 0, .46, .12, 4.1, 0, t);
        if (!down) for (let i = 0; i < n; i++) b.box('ashlar', side * 1.82, (i + 1) * STAIR_RISE / n + .95, 2 - (i + .5) * depth, .38, .02, depth, 0, t);
        b.collider(.36, 4, side * 1.82, 0);
      }
      // The wall behind with its archway, and a short tunnel fading into black.
      if (down) archWall(b, 4, 3.0, 1.1, 2.35, PIT, -2 - T / 2, t);
      else {
        b.box('ashlar', 0, STAIR_RISE / 2, -2 - T / 2, 4, STAIR_RISE, T, 0, t);
        const g = new THREE.ExtrudeGeometry(archOutline(4, WALL_H - STAIR_RISE, 3.0, 1.4, 2.5), {depth: T, bevelEnabled: false, curveSegments: 6});
        g.translate(0, 0, -T / 2); b.add(g, 'ashlar', 0, STAIR_RISE, -2 - T / 2, 1, 1, 1, 0, 0, 0, t, [.5, .5]); g.dispose();
      }
      const floorAtWall = (down ? -1 : 1) * STAIR_RISE, roof = down ? 2.3 : STAIR_RISE + 2.6, lo = floorAtWall - 1.2;
      for (const side of [-1, 1]) b.box('ashlar', side * 1.65, (lo + roof) / 2, -2 - T - 1.3, .3, roof - lo, 2.6, 0, tint(.4, .55));
      b.box('ashlar', 0, roof, -2 - T - 1.3, 3.6, .3, 2.6, 0, tint(.35, .5));
      const exit = down || L.level > 1 ? 'void' : 'daylight';
      b.box(exit, 0, floorAtWall + 1.5, -2 - T - 2.55, 3.4, 4, .1);
    });
  }

  // --- altar with candles and an iron cross ------------------------------------------
  if (L.altar) {
    const a = L.altar;
    b.at(W(a.x + a.w / 2), 0, W(a.y + a.h / 2), ang(a.dir), () => {
      b.box('ashlar', 0, .1, -.15, 3.8, .2, 1.7, 0, tint(.6, .7));
      b.box('ashlar', 0, .7, -.45, 2.6, 1.0, 1.0, 0, tint(.8, .95));
      b.box('stone', 0, 1.23, -.45, 2.8, .08, 1.12);
      b.box('cloth', 0, 1.29, -.45, 1.3, .03, 1.16);
      b.box('cloth', 0, .96, .13, 1.3, .6, .02);
      for (let i = 0; i < 7; i++) {
        const x = -1.15 + i * .38 + (r() - .5) * .08, hgt = .12 + r() * .3, z = -.55 + (r() - .5) * .3;
        b.cylinder('wax', x, 1.27 + hgt / 2, z, .035, .045, hgt, 6);
        const f = new THREE.ConeGeometry(.03, .09, 5, 1, true); b.add(f, 'flame', x, 1.27 + hgt + .05, z, 1, 1, 1, 0, 0, 0, new THREE.Color(1, .75, .35)); f.dispose();
      }
      b.beam('iron', [0, 1.6, -.9], [0, 3.8, -.9], .07); b.beam('iron', [-.75, 3.1, -.9], [.75, 3.1, -.9], .06);
      b.collider(2.8, 1.2, 0, -.45);
      const p = new THREE.Vector3(0, 1.7, -.4).applyMatrix4(b.root); b.markers.push({kind: 'candles', x: p.x, y: p.y, z: p.z});
    });
  }

  // --- sarcophagi, lids pushed askew -------------------------------------------------
  for (const tb of L.tombs) {
    b.at(W(tb.x + .5), 0, W(tb.y + .5), ang(tb.dir), () => {
      const t = tint(.7, .9), skew = (r() - .5) * .3;
      b.box('ashlar', 0, .38, -.38, 1.9, .76, .92, 0, t);
      b.box('ashlar', 0, .07, -.38, 2.05, .14, 1.05, 0, t.clone().multiplyScalar(.8));
      b.box('void', 0, .755, -.38, 1.7, .01, .72);
      b.box('stone', skew * 1.2, .84, -.38 + skew, 2.0, .15, 1.0, skew, t);
      b.box('ashlar', skew * 1.2, .93, -.38 + skew, .12, .04, .7, skew, t.clone().multiplyScalar(.7));
      b.box('ashlar', skew * 1.2, .93, -.38 + skew, .5, .04, .12, skew, t.clone().multiplyScalar(.7));
      b.collider(2.05, 1.1, 0, -.38);
    });
  }

  // --- wall torches -----------------------------------------------------------------
  for (const sc of L.sconces) {
    const d = sc.dir, face = CELL / 2;
    b.at(W(sc.x + .5) + d.x * face, 0, W(sc.y + .5) + d.y * face, ang(d), () => {
      b.box('iron', 0, 2.25, .04, .13, .42, .08);
      b.beam('iron', [0, 2.12, .05], [0, 2.3, .34], .022);
      b.beam('darkwood', [0, 2.18, .38], [0, 2.62, .33], .045);
      b.cylinder('iron', 0, 2.6, .33, .08, .05, .1, 6);
      const o = new THREE.ConeGeometry(.1, .36, 6, 1, true); b.add(o, 'flame', 0, 2.83, .33, 1, 1, 1, 0, 0, 0, new THREE.Color(1, .45, .12)); o.dispose();
      const i = new THREE.ConeGeometry(.05, .22, 5, 1, true); b.add(i, 'flame', 0, 2.76, .33, 1, 1, 1, 0, 0, 0, new THREE.Color(1, .85, .5)); i.dispose();
      const p = new THREE.Vector3(0, 2.8, .45).applyMatrix4(b.root); b.markers.push({kind: 'torch', x: p.x, y: p.y, z: p.z});
    });
  }

  // --- rubble, bones, skulls and old blood -------------------------------------------
  for (const d of L.debris) {
    const x = W(d.x), z = W(d.y);
    if (d.kind === 'rubble') {
      for (let k = 0; k < 3; k++) { const g = new THREE.DodecahedronGeometry(.07 + r() * .1 * d.s, 0); b.add(g, 'rock', x + (r() - .5) * .5, .04, z + (r() - .5) * .5, 1, .6, 1, r(), r() * 6, 0, tint(.5, .8)); g.dispose(); }
    } else if (d.kind === 'bones') {
      for (let k = 0; k < 3; k++) { const a = d.rot + k * 1.1, l = .18 + r() * .25, bx = x + (r() - .5) * .3, bz = z + (r() - .5) * .3; b.beam('bone', [bx - Math.cos(a) * l, .03, bz - Math.sin(a) * l], [bx + Math.cos(a) * l, .03, bz + Math.sin(a) * l], .018, tint(.7, .95)); }
    } else {
      b.at(x, 0, z, d.rot, () => {
        const s = new THREE.SphereGeometry(.1, 8, 6); b.add(s, 'bone', 0, .1, 0, 1, .9, 1.15, 0, 0, 0, tint(.75, .95)); s.dispose();
        b.box('bone', 0, .03, .07, .1, .05, .07);
        for (const ex of [-.04, .04]) b.box('void', ex, .11, .105, .035, .03, .02);
      });
    }
  }
  for (const s of L.stains) {
    const g = new THREE.CircleGeometry(.5, 12), p = g.attributes.position;
    for (let i = 1; i < p.count; i++) { const k = .55 + r() * .75; p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
    g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    b.add(g, 'blood', W(s.x), .008, W(s.y), s.s * 1.6, 1, s.s, 0, s.rot, 0, tint(.7, 1)); g.dispose();
  }

  const group = b.finish(); group.name = 'Cathedral level ' + L.level;

  // --- wooden doors: separate meshes so they can swing ------------------------------
  const doors = [], dr = rng(L.seed ^ 0x27d4eb2f), templates = new Map();
  L.openings.forEach((o, index) => {
    if (dr() >= DOOR_CHANCE) return;
    const {aw, x, z, yaw} = archFrame(o);
    let t = templates.get(aw);
    if (!t) templates.set(aw, t = [1, -1].map(side => doorLeaf(materials, side, aw, 2.75, 3.9)));
    const root = new THREE.Group(); root.name = 'Door ' + index;
    root.position.set(x, 0, z); root.rotation.y = yaw;
    const leaves = [1, -1].map((side, i) => {
      const pivot = new THREE.Group(); pivot.position.x = -side * (aw / 2 - HINGE_IN);
      pivot.add(t[i].clone()); root.add(pivot); return pivot;
    });
    group.add(root);
    doors.push({index, opening: o, root, leaves, x, z, yaw, half: aw / 2, lw: aw / 2 - HINGE_IN - .015, open: 0, dir: 0, segs: null});
  });
  return {group, colliders: b.colliders, markers: b.markers, doors};
}
