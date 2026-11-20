import type * as THREE from 'three';
import type { FrameStats } from './types';

/** Averages frame timing over ~0.5 s windows (wall clock). */
export class FrameMeter {
  private frames = 0;
  private windowStart = performance.now();
  private last = performance.now();
  private sumMs = 0;
  latest: FrameStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, pixelRatio: 1 };

  frame(info: THREE.WebGLInfo, pixelRatio: number): FrameStats | null {
    const now = performance.now();
    this.sumMs += now - this.last;
    this.last = now;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < 500) return null;
    this.latest = {
      fps: Math.round((this.frames * 1000) / elapsed),
      frameMs: Math.round((this.sumMs / this.frames) * 10) / 10,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      pixelRatio: Math.round(pixelRatio * 100) / 100,
    };
    this.frames = 0;
    this.sumMs = 0;
    this.windowStart = now;
    return this.latest;
  }
}
