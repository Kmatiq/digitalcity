/**
 * Trafikledare — pure game rules (no three.js). Incidents are FICTIONAL; the vehicles
 * they affect are the real live HSL vehicles on the slab.
 */
import {
  distanceToPolyline,
  pointAt,
  polylineLength,
  type Pt,
  type TransitNetwork,
} from '../../layers/transit/transitData';

export const SHIFT_S = 300;
export const CREWS = 2;
export const COST_REROUTE = 150;
export const COST_BUS = 300;
export const BONUS_RESOLVED = 400;
export const START_SCORE = 10000;
const PASSENGERS_PER_VEHICLE = 70;
const AFFECT_RADIUS = 20;
const BRIDGE_RADIUS = 90;
const MAX_ACTIVE = 3;

export type IncidentKind = 'derail' | 'car' | 'signal';
export const KINDS: Record<IncidentKind, { label: string; repair: number }> = {
  derail: { label: 'Urspårning', repair: 60 },
  car: { label: 'Bil på spåret', repair: 25 },
  signal: { label: 'Signalfel', repair: 40 },
};

export interface Incident {
  id: number;
  kind: IncidentKind;
  x: number;
  z: number;
  place: string;
  routes: string[]; // affected GTFS route ids
  rerouted: string[];
  status: 'active' | 'repairing' | 'resolved';
  repairLeft: number;
  resolvedAt: number;
  bridged: boolean;
}

export interface ProvisionalLine {
  id: number;
  pts: Pt[];
}

export interface GameState {
  phase: 'intro' | 'running' | 'over';
  elapsed: number;
  nextSpawn: number;
  delayMin: number;
  costs: number;
  resolved: number;
  crewsBusy: number;
  incidents: Incident[];
  lines: ProvisionalLine[];
  nextId: number;
}

export function newGame(): GameState {
  return {
    phase: 'intro',
    elapsed: 0,
    nextSpawn: 4,
    delayMin: 0,
    costs: 0,
    resolved: 0,
    crewsBusy: 0,
    incidents: [],
    lines: [],
    nextId: 1,
  };
}

export const score = (g: GameState): number =>
  Math.max(0, Math.round(START_SCORE + g.resolved * BONUS_RESOLVED - g.delayMin - g.costs));

export const timeLeft = (g: GameState): number => Math.max(0, SHIFT_S - g.elapsed);

/** Choose a point on a random tram line, away from the slab edge and other incidents. */
export function spawnIncident(
  g: GameState,
  net: TransitNetwork,
  limit: number,
  rnd: () => number = Math.random,
): Incident | null {
  // main tram lines only (skip depot/night variants such as 5H, 7T, 9N)
  const trams = new Set(
    net.routes.filter((r) => r.mode === 'tram' && /^\d+$/.test(r.short)).map((r) => r.id),
  );
  const shapes = net.shapes.filter((s) => trams.has(s.route));
  if (!shapes.length) return null;
  const active = g.incidents.filter((i) => i.status !== 'resolved');
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = shapes[Math.floor(rnd() * shapes.length)];
    const { p } = pointAt(s.pts, rnd() * polylineLength(s.pts));
    const [x, z] = p;
    if (Math.abs(x) > limit || Math.abs(z) > limit) continue;
    if (active.some((i) => Math.hypot(i.x - x, i.z - z) < 250)) continue;
    const routes = [
      ...new Set(
        shapes.filter((o) => distanceToPolyline(o.pts, x, z) < AFFECT_RADIUS).map((o) => o.route),
      ),
    ];
    const kinds = Object.keys(KINDS) as IncidentKind[];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    return {
      id: g.nextId++,
      kind,
      x,
      z,
      place: nearestStopName(net, x, z),
      routes,
      rerouted: [],
      status: 'active',
      repairLeft: KINDS[kind].repair,
      resolvedAt: 0,
      bridged: false,
    };
  }
  return null;
}

function nearestStopName(net: TransitNetwork, x: number, z: number): string {
  let best = '';
  let d = Infinity;
  for (const s of net.stops) {
    const dd = Math.hypot(s.x - x, s.z - z);
    if (dd < d) [d, best] = [dd, s.name];
  }
  return best;
}

/**
 * Advance the simulation. `vehiclesOnRoute` returns how many live vehicles of a route
 * are on the slab right now (at least one is assumed to be affected).
 */
export function tick(
  g: GameState,
  dt: number,
  net: TransitNetwork,
  limit: number,
  vehiclesOnRoute: (routeId: string) => number,
): Incident | null {
  if (g.phase !== 'running') return null;
  g.elapsed += dt;
  let spawned: Incident | null = null;
  const active = g.incidents.filter((i) => i.status !== 'resolved');
  if (g.elapsed >= g.nextSpawn) {
    g.nextSpawn = g.elapsed + 30 + Math.random() * 15;
    if (active.length < MAX_ACTIVE) {
      spawned = spawnIncident(g, net, limit);
      if (spawned) g.incidents.push(spawned);
    }
  }
  for (const i of g.incidents) {
    if (i.status === 'repairing') {
      i.repairLeft -= dt;
      if (i.repairLeft <= 0) {
        i.status = 'resolved';
        i.resolvedAt = g.elapsed;
        g.resolved++;
        g.crewsBusy--;
      }
    }
    if (i.status === 'resolved') continue;
    i.bridged = g.lines.some((l) => distanceToPolyline(l.pts, i.x, i.z) < BRIDGE_RADIUS);
    const factor = i.bridged ? 0.5 : 1;
    for (const r of i.routes) {
      if (i.rerouted.includes(r)) continue;
      const n = Math.max(1, vehiclesOnRoute(r));
      g.delayMin += ((n * PASSENGERS_PER_VEHICLE * dt) / 60) * factor;
    }
  }
  // forget resolved incidents after a short while (marker fades out)
  g.incidents = g.incidents.filter((i) => i.status !== 'resolved' || g.elapsed - i.resolvedAt < 4);
  if (g.elapsed >= SHIFT_S) g.phase = 'over';
  return spawned;
}

export function sendCrew(g: GameState, id: number): boolean {
  const i = g.incidents.find((x) => x.id === id);
  if (!i || i.status !== 'active' || g.crewsBusy >= CREWS) return false;
  i.status = 'repairing';
  g.crewsBusy++;
  return true;
}

export function reroute(g: GameState, id: number, route: string): boolean {
  const i = g.incidents.find((x) => x.id === id);
  if (!i || i.status === 'resolved' || i.rerouted.includes(route)) return false;
  i.rerouted.push(route);
  g.costs += COST_REROUTE;
  return true;
}

export function addProvisionalLine(g: GameState, pts: Pt[]): ProvisionalLine | null {
  if (pts.length < 2 || polylineLength(pts) < 50) return null;
  const line = { id: g.nextId++, pts };
  g.lines.push(line);
  g.costs += COST_BUS;
  return line;
}
