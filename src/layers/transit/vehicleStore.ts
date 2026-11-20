/**
 * Live vehicle state with smooth motion: each ~1 Hz HFP sample sets a target, the shown
 * position dead-reckons along the heading for up to 3 s and eases towards it.
 */
import type { VehicleUpdate } from './hfpClient';
import type { TransitMode } from './transitData';

const MAX_EXTRAPOLATE_S = 3;
const STALE_S = 90;

export interface Vehicle {
  id: string;
  mode: TransitMode;
  line: string;
  route: string;
  headsign: string;
  delay: number | null;
  speed: number;
  /** last reported position (local meters) and heading (radians, clockwise from north) */
  tx: number;
  tz: number;
  th: number;
  /** shown position / heading */
  x: number;
  z: number;
  h: number;
  receivedAt: number; // performance.now() ms
  tst: number;
  fresh: boolean; // never shown yet -> snap
}

export class VehicleStore {
  readonly vehicles = new Map<string, Vehicle>();

  constructor(
    private toLocal: (lon: number, lat: number) => [number, number],
    private inBounds: (x: number, z: number) => boolean,
  ) {}

  ingest(u: VehicleUpdate): void {
    const [x, z] = this.toLocal(u.lon, u.lat);
    const prev = this.vehicles.get(u.id);
    if (prev && u.tst < prev.tst) return; // out of order
    if (!this.inBounds(x, z)) {
      if (prev) this.vehicles.delete(u.id);
      return;
    }
    const h = (u.heading * Math.PI) / 180;
    if (prev) {
      Object.assign(prev, {
        line: u.line,
        route: u.route,
        headsign: u.headsign,
        delay: u.delay,
        speed: u.speed,
        tx: x,
        tz: z,
        th: u.speed > 0.5 ? h : prev.th,
        receivedAt: performance.now(),
        tst: u.tst,
      });
      return;
    }
    this.vehicles.set(u.id, {
      id: u.id,
      mode: u.mode,
      line: u.line,
      route: u.route,
      headsign: u.headsign,
      delay: u.delay,
      speed: u.speed,
      tx: x,
      tz: z,
      th: h,
      x,
      z,
      h,
      receivedAt: performance.now(),
      tst: u.tst,
      fresh: true,
    });
  }

  update(dt: number): void {
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 2.5);
    for (const [id, v] of this.vehicles) {
      const age = (now - v.receivedAt) / 1000;
      if (age > STALE_S) {
        this.vehicles.delete(id);
        continue;
      }
      const ahead = v.speed * Math.min(age, MAX_EXTRAPOLATE_S);
      const px = v.tx + Math.sin(v.th) * ahead;
      const pz = v.tz - Math.cos(v.th) * ahead;
      if (v.fresh) {
        v.x = px;
        v.z = pz;
        v.h = v.th;
        v.fresh = false;
        continue;
      }
      v.x += (px - v.x) * k;
      v.z += (pz - v.z) * k;
      let dh = v.th - v.h;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      v.h += dh * k;
    }
  }

  byLine(mode: TransitMode, line: string): Vehicle[] {
    return [...this.vehicles.values()].filter((v) => v.mode === mode && v.line === line);
  }
}
