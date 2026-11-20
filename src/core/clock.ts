import type { SimTime } from './types';

/** Simulation clock driven by wall-clock time (never by frame count). */
export class Clock {
  private simMs: number;
  private lastWall = performance.now();
  speed = 1;
  isLive = true;

  constructor(start = new Date()) {
    this.simMs = start.getTime();
  }

  /** Advance using wall-clock delta; returns dt in seconds (wall time). */
  tick(): number {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastWall) / 1000);
    this.lastWall = now;
    if (this.isLive) this.simMs = Date.now();
    else this.simMs += dt * 1000 * this.speed;
    return dt;
  }

  set(date: Date): void {
    this.simMs = date.getTime();
    this.isLive = false;
  }

  goLive(): void {
    this.isLive = true;
    this.speed = 1;
    this.simMs = Date.now();
  }

  get time(): SimTime {
    return { date: new Date(this.simMs), speed: this.isLive ? 1 : this.speed, isLive: this.isLive };
  }
}
