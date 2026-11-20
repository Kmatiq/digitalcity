/** Builds the slab's side walls (strata + water cutaway) from the height grid. */
import * as THREE from 'three';
import type { HeightField } from '../../core/heightfield';
import { bandsAt } from './strata';

export interface EdgeDef {
  start: [number, number]; // x, z
  end: [number, number];
  outward: [number, number];
}

export function edges(hw: number, hd: number): EdgeDef[] {
  return [
    { start: [-hw, -hd], end: [hw, -hd], outward: [0, -1] }, // north
    { start: [hw, -hd], end: [hw, hd], outward: [1, 0] }, // east
    { start: [hw, hd], end: [-hw, hd], outward: [0, 1] }, // south
    { start: [-hw, hd], end: [-hw, -hd], outward: [-1, 0] }, // west
  ];
}

class Builder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  nrm: number[] = [];
  quad(
    a: [number, number],
    b: [number, number],
    ya: [number, number],
    yb: [number, number],
    n: [number, number],
    color: THREE.Color,
    sA: number,
    sB: number,
  ): void {
    // a/b = x,z at two columns; ya/yb = [top, bottom]
    const v = [
      [a[0], ya[0], a[1], sA],
      [a[0], ya[1], a[1], sA],
      [b[0], yb[0], b[1], sB],
      [b[0], yb[1], b[1], sB],
    ];
    for (const i of [0, 2, 1, 2, 3, 1]) {
      const [x, y, z, s] = v[i];
      this.pos.push(x, y, z);
      this.col.push(color.r, color.g, color.b);
      this.uv.push(s / 12, y / 12);
      this.nrm.push(n[0], 0, n[1]);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/**
 * Walls are built per column pair; within a column pair each band is a quad whose top
 * and bottom follow the two columns. Band count can differ between columns at the
 * shoreline, so we pair bands by kind and fall back to collapsing.
 */
export function buildWalls(
  heights: HeightField,
  hw: number,
  hd: number,
  minY: number,
  seaLevel: number,
  step: number,
): { solid: THREE.BufferGeometry; water: THREE.BufferGeometry } {
  const solid = new Builder();
  const water = new Builder();
  const waterColor = new THREE.Color(0xffffff);
  let sOffset = 0;
  for (const e of edges(hw, hd)) {
    const len = Math.hypot(e.end[0] - e.start[0], e.end[1] - e.start[1]);
    const n = Math.round(len / step);
    const at = (i: number): [number, number] => {
      const t = i / n;
      return [e.start[0] + (e.end[0] - e.start[0]) * t, e.start[1] + (e.end[1] - e.start[1]) * t];
    };
    for (let i = 0; i < n; i++) {
      const a = at(i);
      const b = at(i + 1);
      const sA = sOffset + (i / n) * len;
      const sB = sOffset + ((i + 1) / n) * len;
      const gA = heights.sample(a[0], a[1]);
      const gB = heights.sample(b[0], b[1]);
      const bandsA = bandsAt(gA, sA, minY, seaLevel);
      const bandsB = bandsAt(gB, sB, minY, seaLevel);
      for (const ba of bandsA) {
        const bb = bandsB.find((x) => x.kind === ba.kind) ?? {
          ...ba,
          top: ba.kind === 'rock' ? bandsB[bandsB.length - 1].top : gB,
          bottom: ba.kind === 'rock' ? minY : gB,
        };
        solid.quad(a, b, [ba.top, ba.bottom], [bb.top, bb.bottom], e.outward, ba.color, sA, sB);
      }
      // bands present only on side B (shoreline transitions) collapse towards side A
      for (const bb of bandsB) {
        if (bandsA.some((x) => x.kind === bb.kind)) continue;
        solid.quad(a, b, [gA, gA], [bb.top, bb.bottom], e.outward, bb.color, sA, sB);
      }
      if (gA < seaLevel || gB < seaLevel) {
        const ya: [number, number] = [seaLevel, Math.min(gA, seaLevel)];
        const yb: [number, number] = [seaLevel, Math.min(gB, seaLevel)];
        water.quad(a, b, ya, yb, e.outward, waterColor, sA, sB);
      }
    }
    sOffset += len;
  }
  return { solid: solid.geometry(), water: water.geometry() };
}
