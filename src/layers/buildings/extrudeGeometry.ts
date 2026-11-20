/**
 * Footprints with per-vertex eave heights -> one merged, flat-shaded mesh (walls + roofs)
 * with vertex colours and a per-vertex building index for picking.
 * Ring orientation: outer rings get positive signed area (interior on the right of travel),
 * holes negative, so wall normals always point out of the solid.
 */
import * as THREE from 'three';

export interface ExtrudedBuilding {
  id: number;
  base: number;
  rings: number[][]; // flat [x, z, y, x, z, y, ...]; rings[0] = outer, rest = courtyards
}

export interface BuildingPalette {
  wall(b: ExtrudedBuilding): THREE.Color;
  roof(b: ExtrudedBuilding): THREE.Color;
}

type V = [number, number, number]; // x, y, z

function toPts(flat: number[]): V[] {
  const out: V[] = [];
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 2], flat[i + 1]]);
  return out;
}

function signedArea(r: V[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p[0] * q[2] - q[0] * p[2];
  }
  return a / 2;
}

/** Median height of the outer ring's contour vertices. */
export function roofHeight(b: ExtrudedBuilding): number {
  const r = b.rings[0];
  const ys: number[] = [];
  for (let i = 2; i < r.length; i += 3) ys.push(r[i]);
  ys.sort((x, y) => x - y);
  return ys[Math.floor(ys.length / 2)];
}

export function buildExtrudedGeometry(
  buildings: ExtrudedBuilding[],
  palette: BuildingPalette,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const bid: number[] = [];
  const push = (v: V, c: THREE.Color, i: number): void => {
    pos.push(v[0], v[1], v[2]);
    col.push(c.r, c.g, c.b);
    bid.push(i);
  };

  buildings.forEach((b, index) => {
    const wall = palette.wall(b);
    const roof = palette.roof(b);
    // LOD1: flat roof at the median contour height of the outer ring. Contours can mix
    // eave and gable vertices; the median is a robust eave height.
    const top = roofHeight(b);
    const rings = b.rings.map(toPts).map((r, k) => {
      const a = signedArea(r);
      const ring = (k === 0 ? a < 0 : a > 0) ? r.reverse() : r;
      return ring.map((p) => [p[0], top, p[2]] as V);
    });
    // walls
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const c = r[(i + 1) % r.length];
        const ab: V = [a[0], b.base, a[2]];
        const cb: V = [c[0], b.base, c[2]];
        for (const v of [ab, c, cb, ab, a, c]) push(v, wall, index);
      }
    }
    // roof (triangulated in plan, heights from the contour vertices)
    const contour = rings[0].map((p) => new THREE.Vector2(p[0], p[2]));
    const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[2])));
    const all = rings.flat();
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      const a = all[i];
      let bb = all[j];
      let cc = all[k];
      // make the roof face up (+Y)
      const ny = (bb[2] - a[2]) * (cc[0] - a[0]) - (bb[0] - a[0]) * (cc[2] - a[2]);
      if (ny < 0) [bb, cc] = [cc, bb];
      push(a, roof, index);
      push(bb, roof, index);
      push(cc, roof, index);
    }
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('bid', new THREE.Float32BufferAttribute(bid, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
