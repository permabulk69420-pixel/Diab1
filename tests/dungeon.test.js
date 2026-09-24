import test from 'node:test';
import assert from 'node:assert/strict';
import {generateLevel, SOLID, MAX_LEVEL} from '../src/dungeon/generate.js';

// Every generated level must be fully walkable from the arrival point, with reachable stairs.
test('cathedral levels are connected with reachable stairs', () => {
  for (let seed = 1; seed <= 200; seed++) for (let level = 1; level <= MAX_LEVEL; level++) {
    const L = generateLevel({seed, level}), id = `seed ${seed} level ${level}`;
    assert.ok(L, id);
    const {grid, size, blocked, stairs} = L;
    const walk = (x, y) => x >= 0 && y >= 0 && x < size && y < size && grid[y*size+x] !== SOLID && !blocked[y*size+x];
    assert.ok(stairs.up, id + ' has up stairs');
    if (level < MAX_LEVEL) assert.ok(stairs.down, id + ' has down stairs');
    const sx = Math.floor(stairs.up.spawn.x), sy = Math.floor(stairs.up.spawn.y);
    assert.ok(walk(sx, sy), id + ' arrival is walkable');
    const seen = new Uint8Array(size*size), q = [[sx, sy]]; seen[sy*size+sx] = 1; let reached = 0;
    while (q.length) { const [x, y] = q.pop(); reached++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x+dx, Y = y+dy;
        if (walk(X, Y) && !seen[Y*size+X]) { seen[Y*size+X] = 1; q.push([X, Y]); } } }
    let open = 0; for (let i = 0; i < size*size; i++) if (grid[i] !== SOLID && !blocked[i]) open++;
    assert.equal(reached, open, id + ' has no unreachable floor');
    if (stairs.down) { const d = stairs.down.spawn; assert.ok(seen[Math.floor(d.y)*size+Math.floor(d.x)], id + ' down stairs reachable'); }
  }
});

test('the same seed always builds the same level', () => {
  const a = generateLevel({seed: 42, level: 2}), b = generateLevel({seed: 42, level: 2});
  assert.deepEqual([...a.grid], [...b.grid]);
  assert.deepEqual(a.stairs, b.stairs);
});
