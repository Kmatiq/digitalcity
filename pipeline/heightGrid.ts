/**
 * Shared 2 m height grid for the slab: hole filling, water masks, schematic seabed and the
 * on-disk format read by src/core/heightfield.ts.
 * Format: Int16 centimetres (LE), row-major, row 0 = north edge (z = -halfD), col 0 = west.
 */
import { city, halfD, halfW, writePublic } from './common';

export const RES = 2;
export const NX = Math.round((2 * halfW) / RES) + 1;
export const NZ = Math.round((2 * halfD) / RES) + 1;
export const MAX_DEPTH = 10;

export function newGrid(): Float32Array {
  return new Float32Array(NX * NZ).fill(NaN);
}

/** Local x/z of a grid cell. */
export const cellX = (gx: number): number => -halfW + gx * RES;
export const cellZ = (gz: number): number => -halfD + gz * RES;

/** Fill NaN cells from their neighbours; returns the number still missing. */
export function fillHoles(grid: Float32Array): number {
  let missing = 0;
  for (let pass = 0; pass < 50; pass++) {
    missing = 0;
    for (let z = 0; z < NZ; z++)
      for (let x = 0; x < NX; x++) {
        const i = z * NX + x;
        if (!Number.isNaN(grid[i])) continue;
        let s = 0;
        let n = 0;
        for (const j of [i - 1, i + 1, i - NX, i + NX]) {
          if (j >= 0 && j < grid.length && !Number.isNaN(grid[j])) {
            s += grid[j];
            n++;
          }
        }
        if (n) grid[i] = s / n;
        else missing++;
      }
    if (!missing) break;
  }
  return missing;
}

/** Scanline-rasterise polygons ([outer, ...holes], local [x, z]) into a mask. */
export function polygonMask(polygons: [number, number][][][]): Uint8Array {
  const mask = new Uint8Array(NX * NZ);
  for (const poly of polygons) {
    for (let gz = 0; gz < NZ; gz++) {
      const z = cellZ(gz);
      const xs: number[] = [];
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [ax, az] = ring[i];
          const [bx, bz] = ring[i + 1];
          if (az <= z !== bz <= z) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const g0 = Math.max(0, Math.ceil((xs[k] + halfW) / RES));
        const g1 = Math.min(NX - 1, Math.floor((xs[k + 1] + halfW) / RES));
        for (let gx = g0; gx <= g1; gx++) mask[gz * NX + gx] = 1;
      }
    }
  }
  return mask;
}

/** Two-pass chamfer distance (meters) from the nearest non-water cell. */
export function distanceToShore(mask: Uint8Array): Float32Array {
  const d = new Float32Array(NX * NZ);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const D1 = RES;
  const D2 = RES * Math.SQRT2;
  const relax = (i: number, j: number, c: number): void => {
    if (d[j] + c < d[i]) d[i] = d[j] + c;
  };
  for (let z = 0; z < NZ; z++)
    for (let x = 0; x < NX; x++) {
      const i = z * NX + x;
      if (x > 0) relax(i, i - 1, D1);
      if (z > 0) relax(i, i - NX, D1);
      if (x > 0 && z > 0) relax(i, i - NX - 1, D2);
      if (x < NX - 1 && z > 0) relax(i, i - NX + 1, D2);
    }
  for (let z = NZ - 1; z >= 0; z--)
    for (let x = NX - 1; x >= 0; x--) {
      const i = z * NX + x;
      if (x < NX - 1) relax(i, i + 1, D1);
      if (z < NZ - 1) relax(i, i + NX, D1);
      if (x < NX - 1 && z < NZ - 1) relax(i, i + NX + 1, D2);
      if (x > 0 && z < NZ - 1) relax(i, i + NX - 1, D2);
    }
  return d;
}

/** Lower water cells to a SCHEMATIC seabed and write terrain.bin + terrain.json. */
export function writeTerrain(
  grid: Float32Array,
  mask: Uint8Array,
  extraMeta: Record<string, unknown>,
): void {
  const dist = distanceToShore(mask);
  let water = 0;
  const out = new Int16Array(NX * NZ);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    let y = grid[i];
    if (mask[i]) {
      water++;
      y = city.seaLevel - Math.min(MAX_DEPTH, 1.5 + 0.2 * dist[i]);
    }
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    out[i] = Math.round(y * 100);
  }
  writePublic(city.layers.terrain.heightmap, new Uint8Array(out.buffer));
  const meta = {
    ...extraMeta,
    attribution: city.attribution,
    generated: new Date().toISOString(),
    resolution: RES,
    nx: NX,
    nz: NZ,
    encoding: 'int16-cm-le, row 0 = north (z=-halfD), col 0 = west (x=-halfW)',
    minY,
    maxY,
    seabed: { schematic: true, maxDepth: MAX_DEPTH, rule: 'min(max, 1.5 + 0.2 * shoreDist)' },
    waterCells: water,
  };
  writePublic(city.layers.terrain.meta, JSON.stringify(meta, null, 1));
  console.log(meta);
}
