/**
 * Göteborg buildings (LOD1.5) from the city's open base map (baskarta, CC0):
 * photogrammetric roof contours ("Takkonturer", PolyLineZ, RH2000) become footprints whose
 * vertices carry the real eave height; the base is the lowest DTM height under the ring.
 * Run build-terrain-wcs first (needs terrain.bin).
 * Usage: BASKARTA_DIR=/path/to/unzipped/baskarta_shp_v2 CITY=goteborg npm run pipeline:buildings-gbg
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localToProjected, projectedToLocal } from '../src/core/coordinates';
import { city, frame, halfD, halfW, need, writePublic } from './common';
import { assembleRings, groupRings, type P3 } from './footprints';
import { NX, NZ, RES } from './heightGrid';
import { readShapes } from './shapefile';

const DIR = process.env.BASKARTA_DIR ?? '/tmp/gbg/bk';
const MIN_HEIGHT = 2;
const r1 = (v: number): number => Math.round(v * 10) / 10;

function loadGround(): (x: number, z: number) => number {
  const raw = new Int16Array(
    readFileSync(join('public', city.layers.terrain.heightmap)).buffer.slice(0),
  );
  return (x, z) => {
    const gx = Math.min(NX - 1, Math.max(0, Math.round((x + halfW) / RES)));
    const gz = Math.min(NZ - 1, Math.max(0, Math.round((z + halfD) / RES)));
    return raw[gz * NX + gx] / 100;
  };
}

async function main(): Promise<void> {
  const crs = city.crs;
  const pad = 60; // keep buildings crossing the edge; the renderer clips them
  const cs = [
    [-halfW - pad, -halfD - pad],
    [halfW + pad, halfD + pad],
    [-halfW - pad, halfD + pad],
    [halfW + pad, -halfD - pad],
  ].map(([x, z]) => localToProjected(frame, crs, x, z));
  const clip: [number, number, number, number] = [
    Math.min(...cs.map((c) => c[0])),
    Math.min(...cs.map((c) => c[1])),
    Math.max(...cs.map((c) => c[0])),
    Math.max(...cs.map((c) => c[1])),
  ];
  const lines: P3[][] = [];
  const kinds = new Map<string, number>();
  for (const rec of readShapes(join(DIR, 'byggnad_l'), clip)) {
    const typ = rec.attrs.typ ?? '';
    kinds.set(typ, (kinds.get(typ) ?? 0) + 1);
    if (typ !== 'Takkonturer') continue;
    for (const part of rec.parts) {
      lines.push(
        part.map((p) => {
          const l = projectedToLocal(frame, crs, p.x, p.y, 0);
          return [l[0], l[2], p.z] as P3;
        }),
      );
    }
  }
  console.log('line types in area:', Object.fromEntries(kinds));
  const { rings, dropped } = assembleRings(lines);
  const ground = loadGround();
  // structures over water (piers, pontoons): measure from the water surface, not the seabed
  const baseOf = (r: P3[]): number =>
    Math.max(city.seaLevel, Math.min(...r.map((p) => ground(p[0], p[1]))));
  const usable = rings.filter((r) => {
    const base = baseOf(r);
    const top = Math.max(...r.map((p) => p[2]));
    return top - base >= MIN_HEIGHT && r.every((p) => p[2] > -5);
  });
  const fps = groupRings(usable);
  const hb = halfW + pad;
  const buildings = fps
    .filter((f) => f.outer.some(([x, z]) => Math.abs(x) <= hb && Math.abs(z) <= halfD + pad))
    .map((f, i) => {
      const all = [f.outer, ...f.holes];
      const base = baseOf(f.outer);
      return {
        id: i + 1,
        base: r1(base),
        rings: all.map((r) =>
          r.flatMap(([x, z, y]) => [r1(x), r1(z), r1(Math.max(y, base + MIN_HEIGHT))]),
        ),
      };
    });
  const out = {
    source: 'Göteborgs Stad baskarta (byggnad_l, typ=Takkonturer), opengeodata.goteborg.se',
    attribution: need(city.layers.buildings.attribution, 'buildings.attribution'),
    heightSystem: city.heightSystem,
    note: 'LOD1.5: footprint = roof contour, vertex height = eave height (RH2000)',
    generated: new Date().toISOString(),
    buildings,
  };
  writePublic(need(city.layers.buildings.file, 'layers.buildings.file'), JSON.stringify(out));
  const holes = buildings.reduce((s, b) => s + b.rings.length - 1, 0);
  console.log(
    `lines ${lines.length} -> rings ${rings.length} (dropped open chains ${dropped}), usable ${usable.length}`,
  );
  console.log(`buildings ${buildings.length}, courtyards ${holes}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
