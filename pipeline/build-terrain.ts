/**
 * Build a 2 m height grid for the slab from Helsinki's quantized-mesh terrain (2021, N2000).
 * Sea cells (from water.json, run build-water first) get a SCHEMATIC seabed sloping from
 * the shore: depth = min(MAX_DEPTH, 1.5 + 0.2 * distanceFromShore). Real bathymetry is
 * not part of the open dataset — documented in cities/helsinki/DATA.md.
 *
 * Output: Int16 centimetres, row-major, row 0 = north edge (z = -halfD), col 0 = west edge.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localToWgs84, wgs84ToLocal } from '../src/core/coordinates';
import { city, fetchRetry, frame, halfD, halfW, writePublic } from './common';
import { decodeQuantizedMesh } from './quantizedMesh';

const RES = 2;
const ZOOM = Number(process.env.ZOOM ?? 17);
const MAX_DEPTH = 10;
const NX = Math.round((2 * halfW) / RES) + 1;
const NZ = Math.round((2 * halfD) / RES) + 1;

const grid = new Float32Array(NX * NZ).fill(NaN);

function rasterTriangle(p: number[][]): void {
  // p: [gx, gz, y] in grid units
  const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
  const maxX = Math.min(NX - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
  const minZ = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
  const maxZ = Math.min(NZ - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
  const [a, b, c] = p;
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) < 1e-12) return;
  for (let gz = minZ; gz <= maxZ; gz++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gz - c[1])) / det;
      const l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gz - c[1])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      grid[gz * NX + gx] = l1 * a[2] + l2 * b[2] + l3 * c[2];
    }
  }
}

async function loadTiles(): Promise<void> {
  const corners = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ].map(([x, z]) => localToWgs84(frame, [x, 0, z]));
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const w = 180 / 2 ** ZOOM;
  const x0 = Math.floor((Math.min(...lons) + 180) / w);
  const x1 = Math.floor((Math.max(...lons) + 180) / w);
  const y0 = Math.floor((Math.min(...lats) + 90) / w);
  const y1 = Math.floor((Math.max(...lats) + 90) / w);
  const jobs: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
  console.log(`zoom ${ZOOM}: ${jobs.length} tiles`);
  const base = city.layers.terrain.url;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let j = jobs.pop(); j; j = jobs.pop()) {
      const [x, y] = j;
      const r = await fetchRetry(`${base}${ZOOM}/${x}/${y}.terrain`, {
        headers: { Accept: 'application/vnd.quantized-mesh' },
      });
      if (!r.ok) throw new Error(`tile ${x}/${y}: HTTP ${r.status}`);
      const t = decodeQuantizedMesh(await r.arrayBuffer());
      const lon0 = -180 + x * w;
      const lat0 = -90 + y * w;
      const pts = Array.from(t.h, (h, i) => {
        const p = wgs84ToLocal(frame, lon0 + t.u[i] * w, lat0 + t.v[i] * w, h);
        return [(p[0] + halfW) / RES, (p[2] + halfD) / RES, p[1]];
      });
      for (let i = 0; i < t.indices.length; i += 3) {
        rasterTriangle([pts[t.indices[i]], pts[t.indices[i + 1]], pts[t.indices[i + 2]]]);
      }
      if (++done % 25 === 0) console.log(`  ${done} tiles`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/** Scanline-rasterise water polygons into a mask. */
function waterMask(): Uint8Array {
  const mask = new Uint8Array(NX * NZ);
  const json = JSON.parse(readFileSync(join('public', city.layers.water.file), 'utf8')) as {
    polygons: [number, number][][][];
  };
  for (const poly of json.polygons) {
    for (let gz = 0; gz < NZ; gz++) {
      const z = -halfD + gz * RES;
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
function distanceToShore(mask: Uint8Array): Float32Array {
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

function fillHoles(): number {
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

async function main(): Promise<void> {
  await loadTiles();
  console.log('unfilled cells after fill:', fillHoles());
  const mask = waterMask();
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
    source: 'Helsinki terrain 2021 (quantized-mesh), N2000',
    attribution: city.attribution,
    generated: new Date().toISOString(),
    zoom: ZOOM,
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
