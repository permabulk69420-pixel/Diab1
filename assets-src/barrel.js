// Weathered oak barrel for the cathedral: tapered staves of uneven width with rounded
// edges, recessed plank heads, iron hoops with rivets, rust streaks and grime.
// Geometry and textures are all generated here; export with tools/make-asset.mjs.
import * as THREE from 'three';
import {mergeGeometries, mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {rand, noise2, fbm, smooth, mix, rgbCanvas, normalCanvas, texture} from './lib/tex.js';

const H = .92, RB = .31, RE = .256, THICK = .022, STAVES = 18, HEAD_IN = .034;
const HOOPS = [.052, .178, H - .178, H - .052], BAND = .044, IRON = .0045;
const TEX_W = .45;                     // metres of wood across the stave texture
const EDGE = .0045;                    // how far stave edges round off
export const radius = y => RE + (RB - RE) * (1 - (2 * y / H - 1) ** 2);

// ---------------------------------------------------------------- textures
function woodTextures(seed) {
  const W = 512, HP = 1024, n1 = noise2(seed), n2 = noise2(seed + 1), n3 = noise2(seed + 2), n4 = noise2(seed + 3), n5 = noise2(seed + 4);
  const rgb = new Float32Array(W * HP * 3), height = new Float32Array(W * HP);
  for (let y = 0; y < HP; y++) for (let x = 0; x < W; x++) {
    const U = x / W * TEX_W, Y = (1 - (y + .5) / HP) * H;          // metres; Y = 0 at the barrel foot
    // Quarter-sawn oak: tight straight grain, soft tonal streaks, a few medullary-ray flecks.
    const warp = fbm(n1, U * 4, Y * .9, 4) * 2.2 + fbm(n2, U * 18, Y * .35, 3) * .5;
    const g = U * 260 + warp * 6, t = g - Math.floor(g);
    const late = smooth(.72, .92, t) * (1 - smooth(.95, 1, t)) * (.55 + .45 * n2(U * 90, Y * .2));
    const streak = fbm(n4, U * 38, Y * .6, 3);                       // long tonal bands along the stave
    const fiber = n3(U * 1600, Y * 26) * .55 + n3(U * 500, Y * 10) * .45;
    const fleck = smooth(.8, .9, n5(U * 140, Y * 9)) * smooth(.55, .7, n1(U * 12, Y * 3)) * .5;
    const weather = smooth(.42, .8, fbm(n4, U * 2.6 + 9, Y * 1.8, 4));
    let r = .40 + (streak - .5) * .12 - late * .07 + fleck * .05;
    let gr = .275 + (streak - .5) * .09 - late * .055 + fleck * .04;
    let b = .17 + (streak - .5) * .055 - late * .035 + fleck * .025;
    const f = (fiber - .5) * .045; r += f; gr += f; b += f * .8;
    const wg = .34 + (fiber - .5) * .05 + (streak - .5) * .05, wa = weather * .42;   // silvery weathering
    r = mix(r, wg, wa); gr = mix(gr, wg * .95, wa); b = mix(b, wg * .88, wa);
    // Contact shadow along each hoop, rust run-off below it.
    let ao = 1, rust = 0;
    for (const hy of HOOPS) {
      const d = Math.abs(Y - hy) - BAND / 2;
      if (d > 0) ao -= .38 * Math.exp(-d / .009);
      const below = hy - BAND / 2 - Y;
      if (below > 0) {
        const streak = Math.pow(n5(U * 60, hy * 10), 3) * 1.6, len = .015 + .07 * n5(U * 35 + 7, hy * 3);
        rust = Math.max(rust, streak * Math.exp(-below / len));
      }
    }
    rust = Math.min(.8, rust * (.7 + .6 * n3(U * 200, Y * 60)));
    r = mix(r, .33, rust); gr = mix(gr, .15, rust); b = mix(b, .06, rust);
    const grime = (1 - smooth(0, .16, Y)) * .45 + (1 - smooth(0, .025, H - Y)) * .25;
    const k = Math.max(.5, ao) * (1 - grime);
    const i = (y * W + x) * 3; rgb[i] = r * k; rgb[i + 1] = gr * k * .97; rgb[i + 2] = b * k * .93;
    height[y * W + x] = -late * .35 + (fiber - .5) * .22 - weather * (n3(U * 900, Y * 5) - .5) * .5 - fleck * .15;
  }
  return {map: texture(THREE, rgbCanvas(W, HP, rgb), {srgb: true}), normal: texture(THREE, normalCanvas(W, HP, height, 1.6, false))};
}

function ironTextures(seed) {
  const S = 256, n = noise2(seed, 8), sp = noise2(seed + 1, 64);
  const rgb = new Float32Array(S * S * 3), rm = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const rust = smooth(.46, .72, fbm(n, u * 8, v * 8, 5, 2)), speck = Math.pow(sp(u * 64, v * 64), 4);
    const a = Math.min(1, rust + speck * .8), i = (y * S + x) * 3;
    const warm = fbm(n, u * 8 + 3, v * 8 + 5, 3, 2);
    rgb[i] = mix(.085, mix(.24, .36, warm), a); rgb[i + 1] = mix(.085, mix(.11, .17, warm), a); rgb[i + 2] = mix(.09, mix(.05, .07, warm), a);
    rm[i + 1] = mix(.48, .95, a); rm[i + 2] = mix(.8, .15, a);        // glTF: G roughness, B metalness
    height[y * S + x] = rust * .5 - speck * .4 + sp(u * 64 + 11, v * 64) * .1;
  }
  const opt = {repeat: true};
  return {map: texture(THREE, rgbCanvas(S, S, rgb), {...opt, srgb: true}), rm: texture(THREE, rgbCanvas(S, S, rm), opt), normal: texture(THREE, normalCanvas(S, S, height, 3), opt)};
}

// ---------------------------------------------------------------- geometry helpers
/** A grid surface; flips its winding if the normal doesn't face `outward(p)`. */
function surface(rows, cols, fn, outward) {
  const pos = [], uv = [], idx = [], C = cols.length;
  for (let i = 0; i <= rows; i++) for (const s of cols) { const [x, y, z, u, v] = fn(s, i / rows); pos.push(x, y, z); uv.push(u, v); }
  for (let i = 0; i < rows; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = Math.floor(rows / 2) * C + Math.floor(C / 2), N = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, m), P = new THREE.Vector3().fromBufferAttribute(g.attributes.position, m);
  if (N.dot(outward(P)) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
function finish(g, tint) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = tint.r; c[i + 1] = tint.g; c[i + 2] = tint.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function stave(a0, a1, rj, uOff) {
  const ra = (RB + RE) / 2, rows = 10, S = [0, .07, .25, .5, .75, .93, 1];
  const drop = s => EDGE * (1 - Math.min(1, Math.min(s, 1 - s) / .2)) ** 2;
  const U = s => uOff + s * (a1 - a0) * ra / TEX_W;
  const radial = p => new THREE.Vector3(p.x, 0, p.z);
  const at = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  const parts = [
    surface(rows, S, (s, t) => { const y = t * H, a = mix(a0, a1, s); return [...at(a, radius(y) + rj - drop(s), y), U(s), y / H]; }, radial),
    surface(rows, [0, 1], (s, t) => { const y = t * H, a = mix(a0, a1, s); return [...at(a, radius(y) + rj - THICK, y), U(s), y / H]; }, p => radial(p).negate()),
  ];
  for (const [a, sgn] of [[a0, -1], [a1, 1]]) parts.push(surface(rows, [0, 1], (s, t) => {
    const y = t * H; return [...at(a, radius(y) + rj - THICK + s * (THICK - EDGE), y), U(sgn < 0 ? 0 : 1) + s * .01, y / H];
  }, () => new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(sgn)));
  for (const [y, up] of [[H, 1], [0, -1]]) parts.push(surface(1, S, (s, t) => {
    const a = mix(a0, a1, s), rIn = radius(y) + rj - THICK, rOut = radius(y) + rj - drop(s);
    return [...at(a, mix(rIn, rOut, t), y), U(s), y / H - up * .004 * (1 - t)];
  }, () => new THREE.Vector3(0, up, 0)));
  return parts;
}

function head(y0, planks, r, seed) {
  const R = radius(y0 + .016) - THICK + .003, gap = .0016, out = [];
  const w = Array.from({length: planks}, () => .75 + r() * .5), sum = w.reduce((a, b) => a + b);
  let x = -R;
  for (let p = 0; p < planks; p++) {
    const x0 = Math.max(-R + .0008, x + gap), x1 = Math.min(R - .0008, x + w[p] / sum * 2 * R - gap); x += w[p] / sum * 2 * R;
    const z = xx => Math.sqrt(Math.max(0, R * R - xx * xx)), sh = new THREE.Shape(), steps = 8;
    sh.moveTo(x0, -z(x0)); sh.lineTo(x0, z(x0));
    for (let i = 1; i <= steps; i++) { const xx = mix(x0, x1, i / steps); sh.lineTo(xx, z(xx)); }
    sh.lineTo(x1, -z(x1));
    for (let i = steps - 1; i >= 1; i--) { const xx = mix(x0, x1, i / steps); sh.lineTo(xx, -z(xx)); }
    const g = new THREE.ExtrudeGeometry(sh, {depth: .026, bevelEnabled: true, bevelThickness: .003, bevelSize: .0022, bevelSegments: 1, curveSegments: 4});
    const uv = g.attributes.uv, off = r() * .8;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TEX_W + off, (uv.getY(i) + R) / H * .9 + .05);
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + .003, 0);
    out.push(finish(g, new THREE.Color().setScalar(.82 + r() * .22)));
  }
  return out;
}

function hoop(hy, rng) {
  const y0 = hy - BAND / 2, y1 = hy + BAND / 2, rs = y => radius(y) + .0017;
  let prof = [[rs(y0) - .0006, y0], [rs(y0) + IRON - .0016, y0], [rs(y0 + .0016) + IRON, y0 + .0016], [rs(hy) + IRON, hy],
    [rs(y1 - .0016) + IRON, y1 - .0016], [rs(y1) + IRON - .0016, y1], [rs(y1) - .0006, y1]].map(([a, b]) => new THREE.Vector2(a, b));
  let g = new THREE.LatheGeometry(prof, 48);
  const N = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 3), P = new THREE.Vector3().fromBufferAttribute(g.attributes.position, 3);
  if (N.dot(new THREE.Vector3(P.x, 0, P.z)) < 0) { g.dispose(); g = new THREE.LatheGeometry(prof.reverse(), 48); }
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * .22 + hy);
  const parts = [finish(g, new THREE.Color(1, 1, 1))];
  const a0 = rng() * Math.PI * 2;
  for (let k = 0; k < 6; k++) {
    const a = a0 + k * Math.PI / 3 + (rng() - .5) * .3, d = new THREE.SphereGeometry(.0058, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
    d.rotateZ(-Math.PI / 2); d.rotateY(-a); d.translate(Math.cos(a) * (rs(hy) + IRON - .0012), hy, Math.sin(a) * (rs(hy) + IRON - .0012));
    parts.push(finish(d, new THREE.Color().setScalar(.85)));
  }
  return parts;
}

// ---------------------------------------------------------------- the barrel
export function buildBarrel({seed = 7} = {}) {
  const r = rand(seed), wood = [], iron = [];
  const w = Array.from({length: STAVES}, () => .78 + r() * .44), sum = w.reduce((a, b) => a + b);
  let a = r() * Math.PI * 2, first = null;
  for (let k = 0; k < STAVES; k++) {
    const span = w[k] / sum * Math.PI * 2, gap = .0022 / RB;
    const a0 = a + gap / 2, a1 = a + span - gap / 2; a += span;
    if (!first) first = (a0 + a1) / 2;
    const tint = new THREE.Color(.84 + r() * .2, .84 + r() * .17, .84 + r() * .14);
    for (const g of stave(a0, a1, (r() - .5) * .003, r() * .7)) wood.push(finish(g, tint));
  }
  wood.push(...head(H - HEAD_IN - .032, 5, r, seed), ...head(HEAD_IN - .003, 5, r, seed + 1));
  // Bung plug in the belly of one stave.
  const bung = new THREE.CylinderGeometry(.018, .02, .012, 14); bung.rotateZ(Math.PI / 2); bung.rotateY(-first);
  const br = radius(H / 2) + .002; bung.translate(Math.cos(first) * br, H / 2, Math.sin(first) * br);
  wood.push(finish(bung, new THREE.Color(.55, .5, .45)));
  for (const hy of HOOPS) iron.push(...hoop(hy, r));

  const wt = woodTextures(seed * 31 + 5), it = ironTextures(seed * 17 + 3);
  const woodMat = new THREE.MeshStandardMaterial({name: 'BarrelWood', map: wt.map, normalMap: wt.normal, roughness: .86, metalness: 0, vertexColors: true});
  const ironMat = new THREE.MeshStandardMaterial({name: 'BarrelIron', map: it.map, normalMap: it.normal, roughnessMap: it.rm, metalnessMap: it.rm, roughness: 1, metalness: 1, vertexColors: true});
  const group = new THREE.Group(); group.name = 'Barrel';
  // Soft contact shadow (the dungeon renders without shadow maps on Quest).
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const cx = sc.getContext('2d'), gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.52, 'rgba(0,0,0,.7)'); gr.addColorStop(.68, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const st = texture(THREE, sc, {jpeg: false});
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(RE * 3.4, RE * 3.4).rotateX(-Math.PI / 2).translate(0, .003, 0),
    new THREE.MeshBasicMaterial({name: 'BarrelShadow', map: st, transparent: true, depthWrite: false, color: 0x000000}));
  shadow.name = 'BarrelShadow'; shadow.renderOrder = -1; group.add(shadow);
  for (const [name, parts, mat] of [['BarrelWood', wood, woodMat], ['BarrelIron', iron, ironMat]]) {
    const g = mergeVertices(mergeGeometries(parts), 1e-5); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; group.add(m);
  }
  return group;
}
