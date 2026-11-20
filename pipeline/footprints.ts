/**
 * Turn roof-contour polylines (with Z) into building footprints:
 * join open polylines end-to-end into closed rings, then group rings so that a contour
 * lying inside another one at about the same height becomes a hole (courtyard), while a
 * clearly higher inner contour stays a separate, taller part (tower, penthouse).
 */
export type P3 = [number, number, number]; // x, z (local, metres), y = height

const JOIN_TOL = 0.25; // endpoint snapping (m)
const CLOSE_GAP = 1.5; // a chain whose ends are this close is closed
const HOLE_DZ = 1.5;
const CELL = 1;

const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;
const same = (a: P3, b: P3, tol = JOIN_TOL): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

/** Join polylines into closed rings (first point repeated at the end is dropped). */
export function assembleRings(lines: P3[][]): { rings: P3[][]; dropped: number } {
  const rings: P3[][] = [];
  const open: P3[][] = [];
  for (const l of lines) {
    if (l.length < 2) continue;
    if (l.length >= 4 && same(l[0], l[l.length - 1])) rings.push(l.slice(0, -1));
    else open.push(l);
  }
  const byEnd = new Map<string, number[]>();
  const add = (p: P3, i: number): void => {
    const k = cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
    const a = byEnd.get(k) ?? [];
    a.push(i);
    byEnd.set(k, a);
  };
  open.forEach((l, i) => {
    add(l[0], i);
    add(l[l.length - 1], i);
  });
  /** Unused polyline with an endpoint within JOIN_TOL of p (searches neighbouring cells). */
  const findNext = (p: P3, used: Uint8Array): number | undefined => {
    const cx = Math.floor(p[0] / CELL);
    const cz = Math.floor(p[1] / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const j of byEnd.get(cellKey(cx + dx, cz + dz)) ?? []) {
          const l = open[j];
          if (!used[j] && (same(l[0], p) || same(l[l.length - 1], p))) return j;
        }
    return undefined;
  };
  const used = new Uint8Array(open.length);
  let dropped = 0;
  for (let s = 0; s < open.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    let chain = [...open[s]];
    let closed = false;
    let reversed = false;
    for (let guard = 0; guard < 1000; guard++) {
      const tail = chain[chain.length - 1];
      if (same(tail, chain[0]) && chain.length > 3) {
        closed = true;
        break;
      }
      const next = findNext(tail, used);
      if (next === undefined) {
        if (!reversed) {
          // grow from the other end too
          reversed = true;
          chain = chain.reverse();
          continue;
        }
        closed = chain.length > 3 && same(tail, chain[0], CLOSE_GAP);
        if (closed) chain.push(chain[0]);
        break;
      }
      used[next] = 1;
      const l = open[next];
      const seg = same(l[0], tail) ? l : [...l].reverse();
      chain.push(...seg.slice(1));
    }
    if (closed) rings.push(chain.slice(0, -1));
    else dropped++;
  }
  return { rings: rings.filter((r) => r.length >= 3 && Math.abs(area(r)) >= 4), dropped };
}

export function area(r: P3[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function pointInRing(x: number, z: number, r: P3[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const meanY = (r: P3[]): number => r.reduce((s, p) => s + p[2], 0) / r.length;

export interface Footprint {
  outer: P3[];
  holes: P3[][];
}

/** Group rings into footprints with holes (largest rings first). */
export function groupRings(rings: P3[][]): Footprint[] {
  const sorted = [...rings].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const out: Footprint[] = [];
  for (const r of sorted) {
    const [x, z] = r[0];
    // smallest already-placed outer that contains this ring
    let parent: Footprint | null = null;
    for (const f of out) {
      if (!pointInRing(x, z, f.outer)) continue;
      if (!parent || Math.abs(area(f.outer)) < Math.abs(area(parent.outer))) parent = f;
    }
    if (
      parent &&
      meanY(r) <= meanY(parent.outer) + HOLE_DZ &&
      !parent.holes.some((h) => pointInRing(x, z, h))
    ) {
      parent.holes.push(r);
    } else out.push({ outer: r, holes: [] });
  }
  return out;
}
