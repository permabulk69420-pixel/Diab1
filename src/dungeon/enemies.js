// Skeleton warriors: Kane's model, optimised by assets-src/skeleton.js into public/models/skeleton.glb.
// They notice you by sight (or when you get close), chase you through the level on a flow field
// built from your position, swing when in reach, and stay where they fall.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone as cloneSkinned} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {rng, SOLID, ROOM, toWorld, toGrid} from './generate.js';

export const ENEMY_R = .32;
const SPEED = 1.2, TURN = 6, SIGHT = 11, HEAR = 4.5, REACH = 1.3, HIT_AT = .82, ATTACK_LEN = 1.35, COOLDOWN = .5;
const killed = new Map();   // level -> Set of fallen skeleton ids: corpses stay for the session, like Diablo

let modelPromise = null;
function loadModel() {
  return modelPromise ||= new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/skeleton.glb')
    .catch(e => { console.warn('Could not load skeleton model', e); return null; });
}
export function preloadEnemies() { loadModel(); }

/** Deterministic spawn spots: rooms away from both arrival points, one or two per room. */
export function placeSkeletons(L) {
  const {size, grid, blocked, reserved, rooms, stairs} = L, r = rng(L.seed ^ 0x5be0cd19), I = (x, y) => y * size + x;
  const spawns = [stairs.up, stairs.down].filter(Boolean).map(s => ({x: toWorld(s.spawn.x, size), z: toWorld(s.spawn.y, size)}));
  const target = 4 + L.level * 2, out = [];
  const order = rooms.map(R => ({R, k: r()})).sort((a, b) => a.k - b.k).map(e => e.R);
  for (const R of order) {
    if (out.length >= target) break;
    const count = 1 + (r() < .4 ? 1 : 0);
    for (let n = 0, tries = 0; n < count && tries < 20; tries++) {
      const gx = R.x + Math.floor(r() * R.w), gy = R.y + Math.floor(r() * R.h);
      if (grid[I(gx, gy)] !== ROOM || blocked[I(gx, gy)] || reserved[I(gx, gy)]) continue;
      const x = toWorld(gx + .5, size) + (r() - .5) * .8, z = toWorld(gy + .5, size) + (r() - .5) * .8;
      if (spawns.some(s => Math.hypot(s.x - x, s.z - z) < 10)) continue;
      if (out.some(e => Math.hypot(e.x - x, e.z - z) < 1.4)) continue;
      out.push({id: out.length, x, z, yaw: r() * Math.PI * 2}); n++;
    }
  }
  return out;
}

export function createEnemies({L, level, scene, doors, allowed, height, onPlayerHit}) {
  const size = L.size, I = (x, y) => y * size + x, dead = killed.get(level) || new Set(); killed.set(level, dead);
  const hp = 50 + level * 10, damage = 9 + level * 2;
  const list = placeSkeletons(L).map(s => ({...s, hp, state: dead.has(s.id) ? 'dead' : 'idle', t: 0, cool: 0, hitDone: false, stagger: 0, burn: 0,
    vx: 0, vz: 0, obj: null, mixer: null, acts: null, mats: [], sightClock: Math.random() * .3, sees: false, aggro: false}));

  // --- flow field toward the player, rebuilt a few times a second --------------------------------
  const walk = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) walk[i] = L.grid[i] !== SOLID && !L.blocked[i] ? 1 : 0;
  const dist = new Int16Array(size * size), queue = new Int32Array(size * size);
  const closedEdge = (a, b) => {      // a closed door sits on the line between these two cells
    for (const d of doors) {
      if (d.dir) continue; const o = d.opening;
      const [ax, ay, bx, by] = [a % size, (a / size) | 0, b % size, (b / size) | 0];
      if (o.axis === 'x' && ay === by && ay >= o.from && ay < o.to && Math.min(ax, bx) === o.line - 1 && Math.max(ax, bx) === o.line) return true;
      if (o.axis !== 'x' && ax === bx && ax >= o.from && ax < o.to && Math.min(ay, by) === o.line - 1 && Math.max(ay, by) === o.line) return true;
    }
    return false;
  };
  let flowClock = 0;
  function buildFlow(px, pz) {
    dist.fill(-1);
    const sx = Math.floor(toGrid(px, size)), sy = Math.floor(toGrid(pz, size));
    if (sx < 0 || sy < 0 || sx >= size || sy >= size) return;
    let h = 0, t = 0; queue[t++] = I(sx, sy); dist[I(sx, sy)] = 0;
    while (h < t) {
      const c = queue[h++], cx = c % size, cy = (c / size) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const n = I(x, y); if (dist[n] >= 0 || !walk[n] || closedEdge(c, n)) continue;
        dist[n] = dist[c] + 1; queue[t++] = n;
      }
    }
  }
  const clearLine = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / .3);
    for (let i = 1; i < steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps, gx = Math.floor(toGrid(x, size)), gz = Math.floor(toGrid(z, size));
      if (gx < 0 || gz < 0 || gx >= size || gz >= size || !walk[I(gx, gz)]) return false;
    }
    for (const d of doors) if (!d.dir) {       // closed doors block sight too
      const q = t => { const dx = t[0] - d.x, dz = t[1] - d.z, c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
      const [ua, va] = q([ax, az]), [ub, vb] = q([bx, bz]);
      if (va * vb < 0) { const u = ua + (ub - ua) * (va / (va - vb)); if (Math.abs(u) < d.half) return false; }
    }
    return true;
  };

  // --- models ----------------------------------------------------------------------------------------
  let disposed = false;
  loadModel().then(gltf => {
    if (!gltf || disposed) return;
    const clip = n => gltf.animations.find(a => a.name === n);
    for (const e of list) {
      const o = cloneSkinned(gltf.scene); o.position.set(e.x, height(e.x, e.z), e.z); o.rotation.y = e.yaw;
      o.traverse(m => {
        if (!m.isSkinnedMesh) return;
        if (m.material.name === 'Bone') { m.material = m.material.clone(); m.material.emissive.setHex(0xff5a14); m.material.emissiveIntensity = 0; e.mats.push(m.material); }
        m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 1.5);   // covers every pose, incl. lying dead
      });
      e.mixer = new THREE.AnimationMixer(o);
      e.acts = Object.fromEntries(['Idle', 'Walk', 'Attack', 'Death'].map(n => [n, e.mixer.clipAction(clip(n))]));
      e.acts.Attack.setLoop(THREE.LoopOnce); e.acts.Death.setLoop(THREE.LoopOnce); e.acts.Death.clampWhenFinished = true;
      if (e.state === 'dead') { e.acts.Death.play(); e.mixer.update(3); }
      else { e.acts.Idle.play(); e.mixer.setTime(Math.random() * 3); }
      e.current = e.state === 'dead' ? 'Death' : 'Idle';
      e.obj = o; scene.add(o);
    }
  });
  const play = (e, name, fade = .2) => {
    if (!e.acts || e.current === name) return;
    const next = e.acts[name]; next.reset().play();
    e.acts[e.current].crossFadeTo(next, fade, false); e.current = name;
  };

  const alive = e => e.state !== 'dead';
  const blocks = (x, z, r, self) => list.some(e => e !== self && alive(e) && (e.x - x) ** 2 + (e.z - z) ** 2 < (r + ENEMY_R) ** 2);
  const standFor = (e, x, z, px, pz) => allowed(x, z, ENEMY_R) && !blocks(x, z, 0, e) && list.every(o => o === e || !alive(o) || (o.x - x) ** 2 + (o.z - z) ** 2 >= (ENEMY_R * 2) ** 2) && (px - x) ** 2 + (pz - z) ** 2 >= (ENEMY_R + .3) ** 2;

  function hurt(e, amount, fromX, fromZ, push) {
    if (!alive(e)) return;
    e.hp -= amount; e.burn = 1; e.aggro = true;
    if (e.hp <= 0) {
      e.state = 'dead'; dead.add(e.id); play(e, 'Death', .12);
      return;
    }
    // Knock back along the blast and stagger briefly (the swing is interrupted).
    const dx = e.x - fromX, dz = e.z - fromZ, l = Math.hypot(dx, dz) || 1;
    for (let k = 6; k > 0; k--) { const x = e.x + dx / l * push * k / 6, z = e.z + dz / l * push * k / 6; if (allowed(x, z, ENEMY_R)) { e.x = x; e.z = z; break; } }
    e.stagger = .45; e.state = 'chase'; play(e, 'Idle', .08);
  }

  return {
    list,
    blocks,
    /** Living skeleton whose body contains this point (for spell rays). */
    at(x, y, z) { return list.find(e => alive(e) && (e.x - x) ** 2 + (e.z - z) ** 2 < (ENEMY_R + .1) ** 2 && y > e.y - .05 && y < e.y + 1.8) || null; },
    /** Fireball impact: full damage to a directly hit skeleton, splash to anything nearby. */
    blast(point, power, direct) {
      const full = 25 + power * 75, radius = 1.1 + power * 1.3;
      for (const e of list) {
        if (!alive(e)) continue;
        const d = Math.hypot(e.x - point.x, e.z - point.z);
        if (e === direct) hurt(e, full, point.x, point.z, .35 + power * .5);
        else if (d < radius) hurt(e, full * .6 * (1 - d / radius * .6), point.x, point.z, (.25 + power * .45) * (1 - d / radius));
      }
    },
    update(dt, pos) {
      flowClock -= dt; if (flowClock <= 0) { flowClock = .35; buildFlow(pos.x, pos.z); }
      for (const e of list) {
        e.y = height(e.x, e.z);
        if (!e.obj) continue;
        const near = (e.x - pos.x) ** 2 + (e.z - pos.z) ** 2 < 24 ** 2;
        if (e.burn > 0) { e.burn = Math.max(0, e.burn - dt * 1.6); for (const m of e.mats) m.emissiveIntensity = e.burn * e.burn * 2.2; }
        if (!near && e.state !== 'dead') { e.obj.visible = false; continue; }
        e.obj.visible = true;
        if (e.state === 'dead') { if (e.acts.Death.isRunning() || e.burn > 0) e.mixer.update(dt); continue; }
        const dx = pos.x - e.x, dz = pos.z - e.z, d = Math.hypot(dx, dz);
        e.sightClock -= dt;
        if (e.sightClock <= 0) { e.sightClock = .3; e.sees = d < SIGHT && clearLine(e.x, e.z, pos.x, pos.z); if (e.sees || d < HEAR) e.aggro = true; }
        e.cool = Math.max(0, e.cool - dt);
        let face = null, moveX = 0, moveZ = 0;
        if (e.stagger > 0) { e.stagger -= dt; }
        else if (e.state === 'attack') {
          e.t += dt; face = Math.atan2(dx, dz);
          if (!e.hitDone && e.t >= HIT_AT) { e.hitDone = true; if (d < REACH + .4) onPlayerHit?.(damage, e); }
          if (e.t >= ATTACK_LEN) { e.state = 'chase'; e.cool = COOLDOWN; }
        } else if (e.aggro) {
          if (d < REACH && e.cool <= 0) { e.state = 'attack'; e.t = 0; e.hitDone = false; play(e, 'Attack', .12); e.acts.Attack.reset().play(); }
          else {
            e.state = 'chase';
            if (e.sees && d < 7) { moveX = dx / d; moveZ = dz / d; }
            else {
              const gx = Math.floor(toGrid(e.x, size)), gz = Math.floor(toGrid(e.z, size)), here = dist[I(gx, gz)];
              let best = null, bd = here < 0 ? 1e9 : here;
              for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = gx + ox, y = gz + oy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
                const v = dist[I(x, y)]; if (v >= 0 && v < bd) { bd = v; best = [x, y]; }
              }
              if (best) { const tx = toWorld(best[0] + .5, size) - e.x, tz = toWorld(best[1] + .5, size) - e.z, l = Math.hypot(tx, tz) || 1; moveX = tx / l; moveZ = tz / l; }
              else if (here >= 0) { moveX = dx / (d || 1); moveZ = dz / (d || 1); }
            }
            if (d < REACH * .9) { moveX = moveZ = 0; face = Math.atan2(dx, dz); }
          }
        }
        if (moveX || moveZ) {
          const step = SPEED * dt, nx = e.x + moveX * step, nz = e.z + moveZ * step;
          if (standFor(e, nx, nz, pos.x, pos.z)) { e.x = nx; e.z = nz; }
          else if (standFor(e, nx, e.z, pos.x, pos.z)) e.x = nx;
          else if (standFor(e, e.x, nz, pos.x, pos.z)) e.z = nz;
          face = Math.atan2(moveX, moveZ);
          if (e.state === 'chase') play(e, 'Walk');
        } else if (e.state !== 'attack') play(e, 'Idle', .3);
        if (face !== null) { let a = face - e.obj.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); e.obj.rotation.y += a * Math.min(1, dt * TURN); }
        e.obj.position.set(e.x, e.y, e.z);
        e.mixer.update(dt);
      }
    },
    dispose() { disposed = true; for (const e of list) for (const m of e.mats) m.dispose(); },
  };
}
