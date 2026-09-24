import * as THREE from 'three';
import {canStand} from '../geometry.js';
import {makeDungeonMaterials} from '../materials.js';
import {generateLevel, levelSeed, toWorld, toGrid, SOLID, HALL, CELL, DIRS} from './generate.js';
import {buildLevel, STAIR_RISE} from './build.js';

const explored = new Map();   // level -> Uint8Array, kept for the whole session like Diablo's automap

/**
 * One cathedral level as a self-contained "area" the main loop can swap in.
 * Levels are deterministic per (runSeed, level), so going back up finds the same layout.
 */
export function createDungeonArea({level, runSeed, baseMaterials}) {
  const materials = makeDungeonMaterials(baseMaterials);
  const L = generateLevel({seed: levelSeed(runSeed, level), level});
  const {group, colliders, markers} = buildLevel(L, materials);
  const size = L.size, I = (x, y) => y * size + x;
  const seen = explored.get(level) || new Uint8Array(size * size); explored.set(level, seen);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010101);
  // Diablo's light radius: black fog closes in a little more on every level.
  const fogFar = 21 - level * 1.3;
  scene.fog = new THREE.Fog(0x010101, 3.2, fogFar);
  scene.add(new THREE.HemisphereLight(0x55607a, 0x1a120c, 1.1));
  scene.add(group);
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
