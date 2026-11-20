import type * as THREE from 'three';
import type { HeightField } from './heightfield';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

export interface SimTime {
  date: Date; // simulated instant (sun, shadows, history)
  speed: number; // 1 = realtime, 0 = paused, >1 = fast-forward
  isLive: boolean;
}

export interface SlabBounds {
  halfWidth: number; // meters along X (west–east)
  halfDepth: number; // meters along Z (north–south)
  minY: number; // e.g. -50 m
  maxY: number; // e.g. +250 m
}

export interface PickResult {
  layerId: string;
  title: string;
  properties: Record<string, string | number | null>;
}

export interface CityContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  bounds: SlabBounds;
  clipPlanes: THREE.Plane[]; // 4 edge planes (+ optional user section plane later)
  seaLevel: number;
  /**
   * Register every lit material: applies the slab clip planes (unless clip=false) and
   * the active shadow technique (CSM needs per-material setup).
   */
  registerMaterial(m: THREE.Material, opts?: { clip?: boolean }): void;
  toLocal(lon: number, lat: number, elev?: number): THREE.Vector3;
  fromLocal(pos: THREE.Vector3): { lon: number; lat: number; elev: number };
  /** Height grid (loaded before layers). */
  heights: HeightField;
  /** Ground height (N2000) at local x/z. */
  groundHeight(x: number, z: number): number;
  /** Shared priority download queue (nearest-first, timeout, abort). */
  queue: import('./fetchQueue').FetchQueue;
  /** Current camera orbit target, for distance-based priorities. */
  focus: THREE.Vector3;
  resolveUrl(path: string): string;
}

export interface Layer {
  id: string;
  label: string;
  category: 'base' | 'surface' | 'underground' | 'live';
  attribution: string[]; // shown in UI while the layer is visible
  /** Short credit for the always-visible corner when not the city's own data. */
  credit?: string;
  isSchematic?: boolean; // true for illustrative layers
  visible: boolean;
  load(ctx: CityContext, signal: AbortSignal): Promise<void>;
  update(time: SimTime, dt: number): void;
  setQuality(q: QualityLevel): void;
  setVisible(v: boolean): void;
  setClipPlanes?(planes: THREE.Plane[]): void;
  pick?(raycaster: THREE.Raycaster): (PickResult & { distance: number }) | null;
  /** Outstanding work not tracked by the shared queue (e.g. 3D Tiles downloads/parsing). */
  pending?(): number;
  dispose(): void;
}

export type AppMode = 'menu' | 'explore' | 'rescue_game' | 'transit_game' | 'history';

export interface AppModeController {
  id: AppMode;
  title: string;
  description: string;
  locked?: boolean;
  setup(ctx: CityContext): Promise<void>;
  update(time: SimTime, dt: number): void;
  onTap?(event: PointerEvent, raycaster: THREE.Raycaster): void;
  teardown(): Promise<void>;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
}
