/**
 * Height grid for a slab from an OGC WCS 2.0 terrain coverage (Göteborg Höjdmodell 2022,
 * 0.5 m, RH2000, CC0). The DTM contains water surfaces, so water is derived from it:
 * cells at or below WATER_MAX (RH2000) connected to the slab edge or to large areas become
 * water and get the shared SCHEMATIC seabed (see heightGrid.ts).
 * Usage: CITY=goteborg npm run pipeline:terrain-wcs
 */
import { fromArrayBuffer } from 'geotiff';
import { localToProjected } from '../src/core/coordinates';
import { city, fetchRetry, frame, halfD, halfW, need } from './common';
import { cellX, cellZ, fillHoles, newGrid, NX, NZ, writeTerrain } from './heightGrid';

const CHUNK = 500; // m per WCS request
const PIX = 0.5; // coverage resolution (m)
const WATER_MAX = Number(process.env.WATER_MAX ?? 0.3);
const MIN_WATER_CELLS = 400; // isolated low spots smaller than this stay land

interface Raster {
  e0: number;
  n1: number; // north edge
  w: number;
  h: number;
  data: Float32Array;
}

async function fetchCoverage(e0: number, n0: number, e1: number, n1: number): Promise<Raster> {
  const t = city.layers.terrain;
  const q = new URLSearchParams({
    SERVICE: 'WCS',
    REQUEST: 'GetCoverage',
    VERSION: '2.0.1',
    COVERAGEID: need(t.coverage, 'layers.terrain.coverage'),
    FORMAT: 'image/tiff',
  });
  const url = `${need(t.url, 'layers.terrain.url')}?${q}&SUBSET=E(${e0},${e1})&SUBSET=N(${n0},${n1})`;
  const buf = await (await fetchRetry(url)).arrayBuffer();
  const img = await (await fromArrayBuffer(buf)).getImage();
  const [band] = (await img.readRasters()) as unknown as Float32Array[];
  return { e0, n1, w: img.getWidth(), h: img.getHeight(), data: Float32Array.from(band) };
}

async function main(): Promise<void> {
  const crs = city.crs;
  const corners = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ].map(([x, z]) => localToProjected(frame, crs, x, z));
  const pad = 10;
  const minE = Math.floor((Math.min(...corners.map((c) => c[0])) - pad) / PIX) * PIX;
  const maxE = Math.ceil((Math.max(...corners.map((c) => c[0])) + pad) / PIX) * PIX;
  const minN = Math.floor((Math.min(...corners.map((c) => c[1])) - pad) / PIX) * PIX;
  const maxN = Math.ceil((Math.max(...corners.map((c) => c[1])) + pad) / PIX) * PIX;
  const W = Math.round((maxE - minE) / PIX);
  const H = Math.round((maxN - minN) / PIX);
  const dem = new Float32Array(W * H).fill(NaN);
  const jobs: [number, number][] = [];
  for (let e = minE; e < maxE; e += CHUNK)
    for (let n = minN; n < maxN; n += CHUNK) jobs.push([e, n]);
  console.log(`WCS: ${jobs.length} chunks, raster ${W}x${H}`);
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let j = jobs.pop(); j; j = jobs.pop()) {
      const [e, n] = j;
      const r = await fetchCoverage(e, n, Math.min(e + CHUNK, maxE), Math.min(n + CHUNK, maxN));
      const ox = Math.round((r.e0 - minE) / PIX);
      const oy = Math.round((maxN - r.n1) / PIX);
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const v = r.data[y * r.w + x];
          const gx = ox + x;
          const gy = oy + y;
          if (gx < W && gy < H && v > -1000) dem[gy * W + gx] = v;
        }
      console.log(`  ${++done} chunks`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // resample to the slab grid (bilinear in projected space)
  const grid = newGrid();
  const sample = (e: number, n: number): number => {
    const fx = (e - minE) / PIX - 0.5;
    const fy = (maxN - n) / PIX - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number): number =>
      dem[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    return (
      (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
      (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
    );
  };
  for (let gz = 0; gz < NZ; gz++)
    for (let gx = 0; gx < NX; gx++) {
      const [e, n] = localToProjected(frame, crs, cellX(gx), cellZ(gz));
      grid[gz * NX + gx] = sample(e, n);
    }
  console.log('unfilled cells after fill:', fillHoles(grid));
  writeTerrain(grid, waterMask(grid), {
    source: `${city.layers.terrain.source} (${city.heightSystem}) via WCS`,
    waterRule: `connected regions <= ${WATER_MAX} m with >= ${MIN_WATER_CELLS} cells`,
  });
}

/** Low cells -> water, keeping only large connected regions (flood fill). */
function waterMask(grid: Float32Array): Uint8Array {
  const low = new Uint8Array(NX * NZ);
  for (let i = 0; i < grid.length; i++) low[i] = grid[i] <= WATER_MAX ? 1 : 0;
  const mask = new Uint8Array(NX * NZ);
  const seen = new Uint8Array(NX * NZ);
  const stack: number[] = [];
  for (let s = 0; s < low.length; s++) {
    if (!low[s] || seen[s]) continue;
    const region: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % NX;
      for (const j of [x > 0 ? i - 1 : -1, x < NX - 1 ? i + 1 : -1, i - NX, i + NX]) {
        if (j >= 0 && j < low.length && low[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (region.length >= MIN_WATER_CELLS) for (const i of region) mask[i] = 1;
  }
  return mask;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
