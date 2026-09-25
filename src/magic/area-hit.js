import * as THREE from 'three';

/** Ray test for spells against the current area, using its own collision instead of meshes.
 *  Areas provide height(x,z) and solid(x,z) (falls back to !allowed), plus an optional ceiling.
 *  Returns {point, normal, enemy} for the first surface or enemy within `far` metres, or null. */
export function createAreaHitTest(getArea) {
  const p = new THREE.Vector3(), result = {point: new THREE.Vector3(), normal: new THREE.Vector3()}, STEP = .06, E = .12;
  return (from, dir, far) => {
    const a = getArea(), solid = a.solid || ((x, z) => !a.allowed(x, z, .04, null));
    result.enemy = null;
    for (let d = Math.min(STEP, far); ; d = Math.min(d + STEP, far)) {
      p.copy(from).addScaledVector(dir, d);
      const e = a.enemyAt?.(p.x, p.y, p.z);
      if (e) {
        result.point.copy(p); result.normal.set(p.x - e.x, 0, p.z - e.z);
        if (result.normal.lengthSq() < 1e-6) result.normal.set(-dir.x, 0, -dir.z);
        result.normal.normalize(); result.enemy = e; return result;
      }
      const ground = a.height(p.x, p.z);
      if (p.y <= ground) {
        const t = dir.y < -1e-4 ? THREE.MathUtils.clamp((ground - from.y) / dir.y, 0, d) : d;
        result.point.copy(from).addScaledVector(dir, t); result.point.y = Math.max(result.point.y, ground);
        result.normal.set(0, 1, 0); return result;
      }
      if (a.ceiling !== undefined && p.y >= a.ceiling) {
        result.point.copy(p); result.point.y = a.ceiling; result.normal.set(0, -1, 0); return result;
      }
      if (solid(p.x, p.z)) {
        // Surface normal from which neighbours are open.
        let nx = (solid(p.x - E, p.z) ? 1 : 0) - (solid(p.x + E, p.z) ? 1 : 0), nz = (solid(p.x, p.z - E) ? 1 : 0) - (solid(p.x, p.z + E) ? 1 : 0);
        if (!nx && !nz) { nx = -dir.x; nz = -dir.z; }
        result.normal.set(nx, 0, nz).normalize();
        result.point.copy(from).addScaledVector(dir, Math.max(0, d - STEP * .5));
        return result;
      }
      if (d >= far) return null;
    }
  };
}
