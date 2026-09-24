// Cathedral level generator in the spirit of Diablo I's first four levels:
// rooms chained by short two-cell hallways through thick masonry, a few loops,
// pillared naves in the larger rooms and stairs set into wall alcoves.
// Pure data (no Three.js) so it runs in node tests and stays deterministic per seed.
export const CELL = 2;          // metres per grid cell
export const SIZE = 40;         // cells per side (Diablo I used a 40 x 40 dungeon grid)
export const SOLID = 0, ROOM = 1, HALL = 2;
export const MAX_LEVEL = 4;     // the cathedral levels; deeper areas come later
export const DIRS = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];

export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function levelSeed(runSeed, level) {
  let h = (runSeed ^ Math.imul(level, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x85EBCA6B); h = Math.imul(h ^ h >>> 13, 0xC2B2AE35);
  return ((h ^ h >>> 16) >>> 0) || 1;
}
/** Grid coordinate (cell x spans [x, x+1]) to world metres, grid y maps to world z. */
export function toWorld(g, size = SIZE) { return (g - size / 2) * CELL; }
export function toGrid(w, size = SIZE) { return w / CELL + size / 2; }

export function generateLevel({seed = 1, level = 1, size = SIZE} = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const L = tryGenerate((seed + attempt * 7919) >>> 0, level, size);
    if (L) { L.requestedSeed = seed; return L; }
  }
  throw new Error('Could not generate dungeon level ' + level);
}

function tryGenerate(seed, level, size) {
  const r = rng(seed), N = size * size;
  const grid = new Uint8Array(N), roomOf = new Int16Array(N).fill(-1);
  const blocked = new Uint8Array(N);   // floor cells furniture/stairs occupy (not traversable)
  const reserved = new Uint8Array(N);  // floor that must stay clear (stairs approach)
  const I = (x, y) => y * size + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const at = (x, y) => inBounds(x, y) ? grid[I(x, y)] : SOLID;
  const rid = (x, y) => inBounds(x, y) ? roomOf[I(x, y)] : -1;
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inner = (x, y, w, h) => x >= 1 && y >= 1 && x + w <= size - 1 && y + h <= size - 1;
  const solidRect = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (at(xx, yy) !== SOLID) return false;
    return true;
  };
  const carve = (x, y, w, h, type, id) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { grid[I(xx, yy)] = type; roomOf[I(xx, yy)] = id; } };
  const rooms = [], halls = [], openings = [];
  const addRoom = (x, y, w, h) => { const R = {id: rooms.length, x, y, w, h}; rooms.push(R); carve(x, y, w, h, ROOM, R.id); return R; };
  // An opening is where a hall meets a room: a two-cell stretch of boundary line.
  // axis 'x' = boundary at constant grid x (spans y); sign points from the room into the hall.
  const addOpening = (axis, line, from, sign) => openings.push({axis, line, from, to: from + 2, sign});

  // --- rooms chained by halls -------------------------------------------------
  { const w = ri(6, 9), h = ri(6, 9); addRoom(ri(6, size - 6 - w), ri(6, size - 6 - h), w, h); }
  const target = Math.min(19, 11 + level * 2);
  for (let a = 0; a < 1200 && rooms.length < target; a++) {
    const parent = pick(rooms), d = pick(DIRS);
    const big = r() < .28, w = big ? ri(7, 10) : ri(4, 7), h = big ? ri(7, 10) : ri(4, 7);
    const len = r() < .35 ? 1 : ri(2, 6);
    let hx, hy, hw, hh, nx, ny, axis, line1, line2, from;
    if (d.x) {
      from = parent.y + ri(0, parent.h - 2); hy = from; hh = 2; hw = len;
      hx = d.x > 0 ? parent.x + parent.w : parent.x - len;
      nx = d.x > 0 ? hx + len : hx - w; ny = from - ri(0, h - 2);
      axis = 'x'; line1 = d.x > 0 ? parent.x + parent.w : parent.x; line2 = d.x > 0 ? hx + len : hx;
    } else {
      from = parent.x + ri(0, parent.w - 2); hx = from; hw = 2; hh = len;
      hy = d.y > 0 ? parent.y + parent.h : parent.y - len;
      ny = d.y > 0 ? hy + len : hy - h; nx = from - ri(0, w - 2);
      axis = 'z'; line1 = d.y > 0 ? parent.y + parent.h : parent.y; line2 = d.y > 0 ? hy + len : hy;
    }
    if (!inner(nx, ny, w, h) || !inner(hx, hy, hw, hh)) continue;
    if (!solidRect(nx - 1, ny - 1, w + 2, h + 2)) continue;                         // a wall's thickness from everything
    if (!(d.x ? solidRect(hx, hy - 1, hw, 4) : solidRect(hx - 1, hy, 4, hh))) continue; // halls never graze other spaces
    carve(hx, hy, hw, hh, HALL, -1);
    const R = addRoom(nx, ny, w, h);
    halls.push({x: hx, y: hy, w: hw, h: hh, a: parent.id, b: R.id});
    const sg = d.x || d.y;
    addOpening(axis, line1, from, sg); addOpening(axis, line2, from, -sg);
  }
  if (rooms.length < Math.min(7, target)) return null;

  // --- a few loops so the level is not a pure tree -----------------------------
  const linked = new Set(halls.map(h => Math.min(h.a, h.b) + ':' + Math.max(h.a, h.b)));
  let loops = 0; const wantLoops = 1 + Math.floor(level / 2) + (r() < .5 ? 1 : 0);
  for (let a = 0; a < 400 && loops < wantLoops; a++) {
    const R = pick(rooms), d = pick(DIRS), tx = d.y ? 1 : 0, ty = d.x ? 1 : 0;
    let sx, sy;
    if (d.x) { sy = R.y + ri(0, R.h - 2); sx = d.x > 0 ? R.x + R.w : R.x - 1; }
    else { sx = R.x + ri(0, R.w - 2); sy = d.y > 0 ? R.y + R.h : R.y - 1; }
    let k, hit = -1;
    for (k = 1; k <= 4; k++) {
      const cx = sx + d.x * (k - 1), cy = sy + d.y * (k - 1);
      let good = true;
      for (let j = -1; j <= 2; j++) {
        const x = cx + tx * j, y = cy + ty * j;
        if (at(x, y) !== SOLID || (j >= 0 && j <= 1 && !inner(x, y, 1, 1))) { good = false; break; }
      }
      if (!good) break;
      const nx = cx + d.x, ny = cy + d.y, a0 = rid(nx, ny), a1 = rid(nx + tx, ny + ty);
      if (a0 >= 0 && a0 === a1 && a0 !== R.id && at(nx, ny) === ROOM) { hit = a0; break; }
      if (at(nx, ny) !== SOLID || at(nx + tx, ny + ty) !== SOLID) break;
    }
    if (hit < 0) continue;
    const key = Math.min(R.id, hit) + ':' + Math.max(R.id, hit);
    if (linked.has(key)) continue;
    const ex = sx + d.x * (k - 1), ey = sy + d.y * (k - 1);
    const x0 = Math.min(sx, ex), y0 = Math.min(sy, ey);
    const w = d.x ? k : 2, h = d.x ? 2 : k;
    carve(x0, y0, w, h, HALL, -1);
    halls.push({x: x0, y: y0, w, h, a: R.id, b: hit, loop: true});
    linked.add(key); loops++;
    const sg = d.x || d.y, axis = d.x ? 'x' : 'z', from = d.x ? sy : sx;
    const line1 = d.x ? (d.x > 0 ? R.x + R.w : R.x) : (d.y > 0 ? R.y + R.h : R.y);
    const line2 = d.x ? (d.x > 0 ? sx + k : sx - k + 1) : (d.y > 0 ? sy + k : sy - k + 1);
    addOpening(axis, line1, from, sg); addOpening(axis, line2, from, -sg);
  }

  // --- connectivity helpers ---------------------------------------------------
  const walk = i => grid[i] !== SOLID && !blocked[i];
  function bfs(sx, sy) {
    const dist = new Int32Array(N).fill(-1), q = [I(sx, sy)]; dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % size, y = (i / size) | 0;
      for (const d of DIRS) {
        const nx = x + d.x, ny = y + d.y; if (!inBounds(nx, ny)) continue;
        const j = I(nx, ny); if (dist[j] < 0 && walk(j)) { dist[j] = dist[i] + 1; q.push(j); }
      }
    }
    return dist;
  }
  function connected() {
    let first = -1, count = 0;
    for (let i = 0; i < N; i++) if (walk(i)) { count++; if (first < 0) first = i; }
    if (first < 0) return false;
    const d = bfs(first % size, (first / size) | 0); let reached = 0;
    for (let i = 0; i < N; i++) if (d[i] >= 0) reached++;
    return reached === count;
  }
  // Candidate spots along a room's walls. d points from the room interior toward the wall.
  function wallSpots(R, run) {
    const spots = [];
    for (const d of DIRS) {
      const tx = d.y ? 1 : 0, ty = d.x ? 1 : 0, along = d.x ? R.h : R.w;
      for (let o = 0; o <= along - run; o++) {
        const bx = d.x > 0 ? R.x + R.w - 1 : d.x < 0 ? R.x : R.x + o;
        const by = d.y > 0 ? R.y + R.h - 1 : d.y < 0 ? R.y : R.y + o;
        spots.push({d, tx, ty, bx: d.x ? bx : R.x + o, by: d.x ? R.y + o : by, depth: d.x ? R.w : R.h});
      }
    }
    return shuffle(spots);
  }
  // Try to occupy `run` cells along a wall, `deep` cells into the room, keeping `clear` rows free in front.
  function claimAlongWall(R, run, deep, clear, extraCheck) {
    for (const s of wallSpots(R, run)) {
      if (s.depth < deep + clear + 1) continue;
      const cell = (j, k) => [s.bx + s.tx * j - s.d.x * k, s.by + s.ty * j - s.d.y * k];
      const cells = [], front = [];
      for (let j = 0; j < run; j++) { for (let k = 0; k < deep; k++) cells.push(cell(j, k)); for (let k = deep; k < deep + clear; k++) front.push(cell(j, k)); }
      if (!cells.every(([x, y]) => rid(x, y) === R.id && !blocked[I(x, y)] && !reserved[I(x, y)])) continue;
      if (!front.every(([x, y]) => rid(x, y) === R.id && !blocked[I(x, y)])) continue;
      let ok = true;
      for (let j = 0; j < run; j++) { const [x, y] = cell(j, 0); if (at(x + s.d.x, y + s.d.y) !== SOLID) ok = false; }
      // Nothing may open onto the sides of the claimed block (no hall mouths).
      for (let k = 0; k < deep && ok; k++) for (const j of [-1, run]) { const [x, y] = cell(j, k); if (at(x, y) === HALL) ok = false; }
      if (!ok || (extraCheck && !extraCheck(cells, front))) continue;
      for (const [x, y] of cells) blocked[I(x, y)] = 1;
      if (!connected()) { for (const [x, y] of cells) blocked[I(x, y)] = 0; continue; }
      for (const [x, y] of front) reserved[I(x, y)] = 1;
      const minX = Math.min(...cells.map(c => c[0])), minY = Math.min(...cells.map(c => c[1]));
      const w = s.d.x ? deep : run, h = s.d.x ? run : deep;
      return {room: R.id, x: minX, y: minY, w, h, dir: {x: s.d.x, y: s.d.y}, cells, front};
    }
    return null;
  }

  // --- stairs --------------------------------------------------------------------
  function placeStairs(R, kind) {
    const s = claimAlongWall(R, 2, 2, 2);
    if (!s) return null;
    for (const [x, y] of s.cells) reserved[I(x, y)] = 1;
    const cx = s.x + 1, cy = s.y + 1;
    // Arrive 1.3 cells in front of the stairs, facing into the room.
    return {kind, room: R.id, x: s.x, y: s.y, dir: s.dir, spawn: {x: cx - s.dir.x * 2.3, y: cy - s.dir.y * 2.3, face: {x: -s.dir.x, y: -s.dir.y}}};
  }
  let up = null;
  for (const R of [rooms[0], ...rooms.slice(1)]) { up = placeStairs(R, 'up'); if (up) break; }
  if (!up) return null;
  let down = null;
  if (level < MAX_LEVEL) {
    const dist = bfs(Math.floor(up.spawn.x), Math.floor(up.spawn.y));
    const ranked = rooms.filter(R => R.id !== up.room)
      .map(R => ({R, d: dist[I(R.x + (R.w >> 1), R.y + (R.h >> 1))]}))
      .filter(e => e.d > 0).sort((a, b) => b.d - a.d);
    for (const {R} of ranked) { down = placeStairs(R, 'down'); if (down) break; }
    if (!down) return null;
  }

  // --- furniture: an altar in the grandest free room, a few sarcophagi -----------
  const stairRooms = new Set([up.room, down?.room]);
  let altar = null;
  const grand = rooms.filter(R => !stairRooms.has(R.id) && R.w * R.h >= 30).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const R of grand) { altar = claimAlongWall(R, 2, 1, 2); if (altar) break; }
  const tombs = [];
  const tombCount = ri(1, 2) + (level > 2 ? 1 : 0);
  for (let a = 0; a < 30 && tombs.length < tombCount; a++) {
    const R = pick(rooms); if (R.w < 5 || R.h < 5 || R.id === altar?.room) continue;
    const t = claimAlongWall(R, 1, 1, 1); if (t) tombs.push(t);
  }

  // --- pillared naves ---------------------------------------------------------
  const pillars = [];
  for (const R of rooms) {
    if (R.w < 6 || R.h < 6 || r() < .15) continue;
    const line = (s, n) => { const a = []; for (let g = s + 2; g <= s + n - 2; g += 2) a.push(g); const shift = Math.floor((s + n - 2 - a[a.length - 1]) / 2); return a.map(g => g + shift); };
    for (const gx of line(R.x, R.w)) for (const gy of line(R.y, R.h)) {
      const around = [[gx - 1, gy - 1], [gx, gy - 1], [gx - 1, gy], [gx, gy]];
      if (around.every(([x, y]) => rid(x, y) === R.id && !blocked[I(x, y)] && !reserved[I(x, y)])) pillars.push({x: gx, y: gy, room: R.id});
    }
  }

  // --- torches on the walls, at least one per room ------------------------------
  const sconces = [], edges = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = I(x, y); if (grid[i] === SOLID || blocked[i]) continue;
    for (const d of DIRS) if (at(x + d.x, y + d.y) === SOLID) edges.push({x, y, dir: d, room: roomOf[i]});
  }
  shuffle(edges);
  const farFrom = e => sconces.every(s => Math.abs(s.x - e.x) + Math.abs(s.y - e.y) >= 5);
  for (const R of rooms) { const e = edges.find(e => e.room === R.id && farFrom(e)); if (e) sconces.push(e); }
  for (const e of edges) if (r() < .09 && farFrom(e)) sconces.push(e);

  // --- rubble, bones and old blood ---------------------------------------------
  const floor = [];
  for (let i = 0; i < N; i++) if (grid[i] !== SOLID && !blocked[i] && !reserved[i]) floor.push(i);
  const debris = [], stains = [];
  const debrisCount = 26 + level * 10;
  for (let a = 0; a < debrisCount; a++) {
    const i = pick(floor), x = i % size + .15 + r() * .7, y = ((i / size) | 0) + .15 + r() * .7, roll = r();
    debris.push({x, y, kind: roll < .5 ? 'rubble' : roll < .82 ? 'bones' : 'skull', rot: r() * Math.PI * 2, s: .6 + r() * .8});
  }
  for (let a = 0; a < 3 + level * 2; a++) { const i = pick(floor); stains.push({x: i % size + .2 + r() * .6, y: ((i / size) | 0) + .2 + r() * .6, s: .3 + r() * .7, rot: r() * 6.28}); }

  return {seed, level, size, grid, roomOf, blocked, reserved, rooms, halls, openings,
          stairs: {up, down}, altar, tombs, pillars, sconces, debris, stains};
}
