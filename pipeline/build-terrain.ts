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
import { city, fetchRetry, frame, halfD, halfW, need } from './common';
import { fillHoles, newGrid, NX, NZ, polygonMask, RES, writeTerrain } from './heightGrid';
import { decodeQuantizedMesh } from './quantizedMesh';

const ZOOM = Number(process.env.ZOOM ?? 17);
const grid = newGrid();

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

function waterMask(): Uint8Array {
  const json = JSON.parse(
    readFileSync(join('public', need(city.layers.water.file, 'layers.water.file')), 'utf8'),
  ) as {
    polygons: [number, number][][][];
  };
  return polygonMask(json.polygons);
}

async function main(): Promise<void> {
  await loadTiles();
  console.log('unfilled cells after fill:', fillHoles(grid));
  writeTerrain(grid, waterMask(), {
    source: 'Helsinki terrain 2021 (quantized-mesh), N2000',
    zoom: ZOOM,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
