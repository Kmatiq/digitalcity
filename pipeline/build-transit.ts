/**
 * HSL GTFS -> public/<transit.file>: tram, bus and ferry routes whose most common shape
 * per direction crosses the slab (clipped, simplified, local meters) plus stops inside.
 * Usage: GTFS_DIR=/path/to/unzipped/hsl npm run pipeline:transit
 */
import { join } from 'node:path';
import { wgs84ToLocal } from '../src/core/coordinates';
import { readCsv } from './csv';
import { city, frame, halfD, halfW, need, writePublic } from './common';

type Mode = 'tram' | 'bus' | 'ferry';
type Pt = [number, number];

const DIR = process.env.GTFS_DIR ?? '/tmp/gtfs';
const MARGIN = 0; // clip exactly to the slab

function modeOf(routeType: number): Mode | null {
  if (routeType === 0 || routeType === 900) return 'tram';
  if (routeType === 3 || (routeType >= 700 && routeType <= 716)) return 'bus';
  if (routeType === 4 || routeType === 1000) return 'ferry';
  return null;
}

const inside = ([x, z]: Pt): boolean =>
  Math.abs(x) <= halfW + MARGIN && Math.abs(z) <= halfD + MARGIN;

/** Liang–Barsky clip of a segment to the slab square. */
function clipSegment(a: Pt, b: Pt): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] + halfW],
    [dx, halfW - a[0]],
    [-dz, a[1] + halfD],
    [dz, halfD - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

/** Clip a polyline to the slab; returns the pieces that lie inside. */
function clipPolyline(pts: Pt[]): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1]);
    if (!seg) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    const last = cur[cur.length - 1];
    if (!last || Math.hypot(last[0] - seg[0][0], last[1] - seg[0][1]) > 0.01) {
      if (cur.length > 1) pieces.push(cur);
      cur = [seg[0]];
    }
    cur.push(seg[1]);
    if (!inside(pts[i + 1])) {
      pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az) || 1e-9;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
      if (d > maxD) [maxD, idx] = [d, i];
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

async function main(): Promise<void> {
  const routes = new Map<string, { short: string; long: string; mode: Mode }>();
  await readCsv(join(DIR, 'routes.txt'), (g) => {
    const mode = modeOf(Number(g('route_type')));
    if (mode)
      routes.set(g('route_id'), { short: g('route_short_name'), long: g('route_long_name'), mode });
  });
  console.log('routes', routes.size);

  // most common shape per route+direction, and a headsign for it
  const counts = new Map<string, Map<string, { n: number; headsign: string }>>();
  await readCsv(join(DIR, 'trips.txt'), (g) => {
    const rid = g('route_id');
    if (!routes.has(rid)) return;
    const key = `${rid}|${g('direction_id')}`;
    let m = counts.get(key);
    if (!m) counts.set(key, (m = new Map()));
    const sid = g('shape_id');
    const e = m.get(sid) ?? { n: 0, headsign: g('trip_headsign') };
    e.n++;
    m.set(sid, e);
  });
  const wanted = new Map<string, { routeId: string; dir: number; headsign: string }>();
  for (const [key, m] of counts) {
    const [routeId, dir] = key.split('|');
    const [sid, e] = [...m.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    wanted.set(sid, { routeId, dir: Number(dir), headsign: e.headsign });
  }
  console.log('candidate shapes', wanted.size);

  const raw = new Map<string, { seq: number; p: Pt }[]>();
  await readCsv(join(DIR, 'shapes.txt'), (g) => {
    const sid = g('shape_id');
    if (!wanted.has(sid)) return;
    const l = wgs84ToLocal(frame, Number(g('shape_pt_lon')), Number(g('shape_pt_lat')), 0);
    let arr = raw.get(sid);
    if (!arr) raw.set(sid, (arr = []));
    arr.push({ seq: Number(g('shape_pt_sequence')), p: [l[0], l[2]] });
  });

  const outRoutes = new Map<string, { id: string; short: string; long: string; mode: Mode }>();
  const shapes: { route: string; dir: number; headsign: string; pts: Pt[] }[] = [];
  for (const [sid, arr] of raw) {
    const info = wanted.get(sid)!;
    arr.sort((a, b) => a.seq - b.seq);
    for (const piece of clipPolyline(arr.map((e) => e.p))) {
      const pts = simplify(piece, 0.8).map(([x, z]) => [r1(x), r1(z)] as Pt);
      const len = pts.reduce(
        (s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0),
        0,
      );
      if (len < 60) continue;
      shapes.push({ route: info.routeId, dir: info.dir, headsign: info.headsign, pts });
      const r = routes.get(info.routeId)!;
      outRoutes.set(info.routeId, { id: info.routeId, ...r });
    }
  }

  const stops: { id: string; name: string; x: number; z: number; mode: Mode | null }[] = [];
  await readCsv(join(DIR, 'stops.txt'), (g) => {
    if (g('location_type') !== '0') return;
    const l = wgs84ToLocal(frame, Number(g('stop_lon')), Number(g('stop_lat')), 0);
    if (!inside([l[0], l[2]])) return;
    stops.push({
      id: g('stop_id'),
      name: g('stop_name'),
      x: r1(l[0]),
      z: r1(l[2]),
      mode: modeOf(Number(g('vehicle_type'))),
    });
  });

  const out = {
    source: 'HSL GTFS (https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip)',
    attribution: 'HSL (CC BY 4.0)',
    generated: new Date().toISOString(),
    routes: [...outRoutes.values()].sort(
      (a, b) =>
        a.mode.localeCompare(b.mode) || a.short.localeCompare(b.short, 'fi', { numeric: true }),
    ),
    shapes,
    stops,
  };
  writePublic(need(city.layers.transit, 'layers.transit').file, JSON.stringify(out));
  const byMode = (m: Mode): number => out.routes.filter((r) => r.mode === m).length;
  console.log(
    `routes: tram ${byMode('tram')}, bus ${byMode('bus')}, ferry ${byMode('ferry')}; shapes ${shapes.length}; stops ${stops.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
