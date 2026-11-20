/**
 * Fetch water polygons (sea + other water areas) from Helsinki WFS, convert to the
 * local frame, clip to the slab square and simplify. Output: public/<water.file>
 *   { polygons: [ [ outerRing, ...holes ] ], ring = [[x, z], ...] }  (local meters)
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { epsg3879ToLocal, localTo3879 } from '../src/core/coordinates';
import { city, fetchRetry, frame, halfD, halfW, need, writePublic } from './common';

type Ring = [number, number][];

function wfsUrl(typeName: string): string {
  const pad = 200;
  const corners = [
    localTo3879(frame, -halfW - pad, -halfD - pad),
    localTo3879(frame, halfW + pad, halfD + pad),
    localTo3879(frame, -halfW - pad, halfD + pad),
    localTo3879(frame, halfW + pad, -halfD - pad),
  ];
  const es = corners.map((c) => c[0]);
  const ns = corners.map((c) => c[1]);
  const bbox = [Math.min(...es), Math.min(...ns), Math.max(...es), Math.max(...ns)];
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:3879',
    bbox: `${bbox.map((v) => v.toFixed(1)).join(',')},EPSG:3879`,
  });
  return `${city.layers.water.url}?${q}`;
}

/** Douglas–Peucker on an open polyline. */
function simplify(pts: Ring, tol: number): Ring {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az);
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = pts[i];
      const d =
        len < 1e-9
          ? Math.hypot(px - ax, pz - az) // closed ring: distance to the shared endpoint
          : Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / len;
      if (d > maxD) [maxD, idx] = [d, i];
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function toLocalRing(ring: number[][]): Ring {
  return ring.map(([e, n]) => {
    const p = epsg3879ToLocal(frame, e, n, 0);
    return [p[0], p[2]] as [number, number];
  });
}

async function main(): Promise<void> {
  const all: Polygon[] = [];
  for (const t of need(city.layers.water.typeNames, 'layers.water.typeNames')) {
    const url = wfsUrl(t);
    console.log('fetch', t);
    const json = (await (await fetchRetry(url)).json()) as {
      features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
    };
    for (const f of json.features) {
      const g = f.geometry;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
      for (const p of polys) all.push(p.map(toLocalRing));
    }
    console.log(`  ${json.features.length} features`);
  }
  const square: Polygon = [
    [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
      [-halfW, -halfD],
    ],
  ];
  const pieces: MultiPolygon[] = all
    .map((p) => polygonClipping.intersection(p, square))
    .filter((m) => m.length > 0);
  const clipped: MultiPolygon =
    pieces.length > 1 ? polygonClipping.union(pieces[0], ...pieces.slice(1)) : (pieces[0] ?? []);
  const round = (v: number): number => Math.round(v * 10) / 10;
  const polygons = clipped
    .map((poly) =>
      poly
        .map((ring) => simplify(ring as Ring, 0.3).map(([x, z]) => [round(x), round(z)]))
        .filter((ring) => ring.length >= 4),
    )
    .filter((poly) => poly.length > 0);
  const out = {
    source: city.layers.water.typeNames,
    attribution: city.attribution,
    generated: new Date().toISOString(),
    frame: { lat: city.center.lat, lon: city.center.lon },
    polygons,
  };
  writePublic(need(city.layers.water.file, 'layers.water.file'), JSON.stringify(out));
  console.log(`${polygons.length} polygons`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
