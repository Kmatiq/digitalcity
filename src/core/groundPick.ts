import * as THREE from 'three';

/** Intersect a ray with the height grid (march + bisection). Returns null if no hit. */
export function rayGround(
  ray: THREE.Ray,
  height: (x: number, z: number) => number,
  maxDist = 8000,
): THREE.Vector3 | null {
  const p = new THREE.Vector3();
  const above = (t: number): boolean => {
    ray.at(t, p);
    return p.y > height(p.x, p.z);
  };
  let prev = 0;
  if (!above(0)) return null;
  for (let t = 4; t <= maxDist; t += Math.max(4, t * 0.01)) {
    if (!above(t)) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid)) lo = mid;
        else hi = mid;
      }
      ray.at(hi, p);
      return p.clone();
    }
    prev = t;
  }
  return null;
}
