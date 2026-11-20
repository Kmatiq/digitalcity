/** Static network (pipeline/build-transit.ts output) and polyline helpers. */
export type TransitMode = 'tram' | 'bus' | 'ferry';
export type Pt = [number, number];

export interface TransitRoute {
  id: string;
  short: string;
  long: string;
  mode: TransitMode;
}

export interface TransitShape {
  route: string;
  dir: number;
  headsign: string;
  pts: Pt[];
}

export interface TransitStop {
  id: string;
  name: string;
  x: number;
  z: number;
  mode: TransitMode | null;
}

export interface TransitNetwork {
  routes: TransitRoute[];
  shapes: TransitShape[];
  stops: TransitStop[];
}

export const MODE_COLORS: Record<TransitMode, number> = {
  tram: 0x00985f, // HSL tram green
  bus: 0x007ac9, // HSL bus blue
  ferry: 0x00b9e4, // HSL ferry
};

export async function loadNetwork(url: string, signal: AbortSignal): Promise<TransitNetwork> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`transit HTTP ${r.status}`);
  return (await r.json()) as TransitNetwork;
}

export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** Point at distance `d` along a polyline, with the segment direction. */
export function pointAt(pts: Pt[], d: number): { p: Pt; dir: Pt } {
  let rest = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (rest <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rest / len) : 0;
      return {
        p: [ax + (bx - ax) * t, az + (bz - az) * t],
        dir: len > 0 ? [(bx - ax) / len, (bz - az) / len] : [1, 0],
      };
    }
    rest -= len;
  }
  return { p: pts[0], dir: [1, 0] };
}

/** Shortest distance from point to polyline. */
export function distanceToPolyline(pts: Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
