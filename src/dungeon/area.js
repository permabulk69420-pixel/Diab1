import * as THREE from 'three';
import {canStand} from '../geometry.js';
import {makeDungeonMaterials} from '../materials.js';
import {generateLevel, levelSeed, toWorld, toGrid, SOLID, HALL, CELL, DIRS} from './generate.js';
import {buildLevel, STAIR_RISE} from './build.js';
import {preloadProps, placeBarrels, addBarrels, BARREL_R} from './props.js';

preloadProps();

const explored = new Map();   // level -> Uint8Array, kept for the whole session like Diablo's automap
const openedDoors = new Map(); // level -> Map(door index -> swing side), doors stay open like in Diablo
const DOOR_SWING = 96 * Math.PI / 180, DOOR_TIME = .75;
const ease = t => t * t * (3 - 2 * t);
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/**
 * One cathedral level as a self-contained "area" the main loop can swap in.
 * Levels are deterministic per (runSeed, level), so going back up finds the same layout.
 */
export function createDungeonArea({level, runSeed, baseMaterials}) {
  const materials = makeDungeonMaterials(baseMaterials);
  const L = generateLevel({seed: levelSeed(runSeed, level), level});
  const {group, colliders, markers, doors} = buildLevel(L, materials);
  const opened = openedDoors.get(level) || new Map(); openedDoors.set(level, opened);
  /** Player position in a door's frame: u along the doorway, v through it. */
  const doorLocal = (d, x, z) => { const dx = x - d.x, dz = z - d.z, c = Math.cos(d.yaw), s = Math.sin(d.yaw); return {u: dx * c - dz * s, v: dx * s + dz * c}; };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function swing(d) {
    const a = DOOR_SWING * ease(d.open);
    d.leaves.forEach((p, i) => { p.rotation.y = -(i ? -1 : 1) * d.dir * a; });
    if (d.open < 1) return;
    // Fully open: each leaf becomes a thin segment you can't walk through.
    d.root.updateMatrixWorld(true);
    d.segs = d.leaves.map((p, i) => { p.localToWorld(tmpA.set(0, 0, 0)); p.localToWorld(tmpB.set((i ? -1 : 1) * d.lw, 0, 0)); return [tmpA.x, tmpA.z, tmpB.x, tmpB.z]; });
  }
  for (const d of doors) if (opened.has(d.index)) { d.dir = opened.get(d.index); d.open = 1; swing(d); }
  const size = L.size, I = (x, y) => y * size + x;
  const seen = explored.get(level) || new Uint8Array(size * size); explored.set(level, seen);

  const barrels = placeBarrels(L);
  for (const b of barrels) colliders.push({type: 'circle', x: b.x, z: b.z, r: BARREL_R * b.s});
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010101);
  // Diablo's light radius: black fog closes in a little more on every level.
  const fogFar = 21 - level * 1.3;
  scene.fog = new THREE.Fog(0x010101, 3.2, fogFar);
  scene.add(new THREE.HemisphereLight(0x55607a, 0x1a120c, 1.1));
  scene.add(group);
  addBarrels(scene, barrels);
  const lights = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff9447, 0, 11, 2); scene.add(l); lights.push(l); }

  const W = g => toWorld(g, size);
  const solidAt = (x, z) => { const gx = Math.floor(toGrid(x, size)), gz = Math.floor(toGrid(z, size)); return gx < 0 || gz < 0 || gx >= size || gz >= size || L.grid[I(gx, gz)] === SOLID; };
  const stairs = [L.stairs.up, L.stairs.down].filter(Boolean).map(s => ({...s, cx: W(s.x + 1), cz: W(s.y + 1)}));
  /** Position inside a stair alcove: t = 0 at its open front, 1 at the wall. */
  function stairAt(x, z) {
    for (const s of stairs) {
      const dx = x - s.cx, dz = z - s.cz, u = dx * s.dir.x + dz * s.dir.y, v = s.dir.x ? dz : dx;
      if (Math.abs(v) < 2 && u > -2 && u < 2.2) return {s, t: Math.min(1, (u + 2) / 4)};
    }
    return null;
  }
  const arrival = s => ({x: W(s.spawn.x), z: W(s.spawn.y), yaw: Math.atan2(-s.spawn.face.x, -s.spawn.face.y)});

  const area = {
    id: 'dungeon', level, seed: L.seed, data: L, scene, far: fogFar + 4,
    arrivals: {up: arrival(L.stairs.up), down: L.stairs.down ? arrival(L.stairs.down) : arrival(L.stairs.up)},
    get home() { return this.arrivals.up; },
    allowed(x, z, r = .26) {
      for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) if (solidAt(x + ox, z + oz)) return false;
      for (const d of doors) {
        if (d.open < .55) { const q = doorLocal(d, x, z); if (Math.abs(q.u) < d.half && Math.abs(q.v) < .06 + r) return false; }
        else if (d.segs) for (const g of d.segs) if (segDist(x, z, ...g) < r + .05) return false;
      }
      return canStand(x, z, colliders, r);
    },
    height(x, z) { const st = stairAt(x, z); return st ? (st.s.kind === 'down' ? -1 : 1) * STAIR_RISE * st.t : 0; },
    trigger(x, z) {
      const st = stairAt(x, z);
      if (!st || st.t < .72) return null;
      if (st.s.kind === 'down') return {to: 'dungeon', level: level + 1, arrive: 'up'};
      return level === 1 ? {to: 'town', arrive: 'cathedral'} : {to: 'dungeon', level: level - 1, arrive: 'down'};
    },
    label() { return 'CATHEDRAL · LEVEL ' + level; },
    update(dt, elapsed, pos) {
      const flame = materials.flame.userData.shader; if (flame) flame.uniforms.uTime.value = elapsed;
      // Doors swing open away from you as you walk up to them.
      for (const d of doors) {
        if (!d.dir) {
          const q = doorLocal(d, pos.x, pos.z);
          if (Math.abs(q.u) < d.half + .6 && Math.abs(q.v) < 2.1) { d.dir = q.v > 0 ? -1 : 1; opened.set(d.index, d.dir); }
        }
        if (d.dir && d.open < 1) { d.open = Math.min(1, d.open + dt / DOOR_TIME); swing(d); }
      }
      const near = markers.map(m => ({m, d: (m.x - pos.x) ** 2 + (m.z - pos.z) ** 2})).sort((a, b) => a.d - b.d);
      for (let i = 0; i < lights.length; i++) {
        const e = near[i]; if (!e) { lights[i].intensity = 0; continue; }
        const f = 1 + Math.sin(elapsed * 9.3 + i * 2.1) * .07 + Math.sin(elapsed * 23.1 + i) * .04;
        lights[i].position.set(e.m.x, e.m.y, e.m.z);
        lights[i].intensity = (e.m.kind === 'candles' ? 9 : 16) * f;
      }
      // Reveal the automap around the player.
      const gx = toGrid(pos.x, size), gz = toGrid(pos.z, size), R = 4.5;
      for (let y = Math.max(0, Math.floor(gz - R)); y <= Math.min(size - 1, gz + R); y++)
        for (let x = Math.max(0, Math.floor(gx - R)); x <= Math.min(size - 1, gx + R); x++)
          if ((x + .5 - gx) ** 2 + (y + .5 - gz) ** 2 < R * R && L.grid[I(x, y)] !== SOLID) seen[I(x, y)] = 1;
    },
    /** Diablo-style automap: only what you've walked near, walls as tan lines. */
    drawMap(c, S, pos, yaw) {
      c.fillStyle = '#0d0f10'; c.fillRect(0, 0, S, S);
      const k = S / size, to = g => g * k;
      c.fillStyle = '#2a2622';
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (seen[I(x, y)]) c.fillRect(to(x), to(y), k + .5, k + .5);
      c.strokeStyle = '#b89c68'; c.lineWidth = Math.max(1.5, k * .18); c.beginPath();
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!seen[I(x, y)]) continue;
        for (const d of DIRS) {
          const nx = x + d.x, ny = y + d.y;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && L.grid[I(nx, ny)] !== SOLID) continue;
          const ax = d.x > 0 ? x + 1 : x, ay = d.y > 0 ? y + 1 : y;
          c.moveTo(to(ax), to(ay)); c.lineTo(to(d.x ? ax : ax + 1), to(d.y ? ay : ay + 1));
        }
      }
      c.stroke();
      // Closed doors show as brown bars across their archway.
      c.strokeStyle = '#8a5a2b'; c.lineWidth = Math.max(2.5, k * .35); c.beginPath();
      for (const d of doors) {
        if (d.dir) continue;
        const o = d.opening, a = o.axis === 'x';
        if (!(a ? seen[I(o.line, o.from)] || seen[I(o.line - 1, o.from)] : seen[I(o.from, o.line)] || seen[I(o.from, o.line - 1)])) continue;
        if (a) { c.moveTo(to(o.line), to(o.from + .2)); c.lineTo(to(o.line), to(o.to - .2)); }
        else { c.moveTo(to(o.from + .2), to(o.line)); c.lineTo(to(o.to - .2), to(o.line)); }
      }
      c.stroke();
      for (const s of stairs) if (seen[I(s.x, s.y)] || seen[I(s.x + 1, s.y + 1)]) {
        c.fillStyle = s.kind === 'down' ? '#c8483a' : '#8fb0c4';
        c.fillRect(to(s.x) + 2, to(s.y) + 2, k * 2 - 4, k * 2 - 4);
        c.fillStyle = '#0d0f10'; c.font = Math.round(k * 1.1) + 'px Georgia'; c.textAlign = 'center';
        c.fillText(s.kind === 'down' ? '▼' : '▲', to(s.x + 1), to(s.y + 1) + k * .4);
      }
      c.save(); c.translate(to(toGrid(pos.x, size)), to(toGrid(pos.z, size))); c.rotate(-yaw);
      c.fillStyle = '#f0d596'; c.beginPath(); c.moveTo(0, -k * .9); c.lineTo(-k * .45, k * .6); c.lineTo(k * .45, k * .6); c.closePath(); c.fill(); c.restore();
      c.fillStyle = '#9a8f78'; c.font = '13px Georgia'; c.textAlign = 'left'; c.fillText('Cathedral · Level ' + level, 12, S - 12);
    },
    dispose() {
      group.traverse(o => o.geometry?.dispose());
      scene.clear();
    }
  };
  return area;
}
export {HALL, CELL};
