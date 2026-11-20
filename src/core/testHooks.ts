/** window.__stadsplattan — automation hooks for tests and screenshots. */
import * as THREE from 'three';
import type { Engine } from './engine';
import { store } from './store';
import type { AppMode, FrameStats, QualityLevel } from './types';
import { APP_VERSION, BUILD_TIME } from './version';

type V3 = [number, number, number] | { x: number; y: number; z: number };
const vec = (v: V3): THREE.Vector3 =>
  Array.isArray(v) ? new THREE.Vector3(...v) : new THREE.Vector3(v.x, v.y, v.z);

export interface TestHooks {
  version: string;
  buildTime: string;
  setCamera(pos: V3, target: V3): void;
  setTime(iso: string | null): void;
  setQuality(level: QualityLevel): void;
  setAppMode(mode: AppMode): Promise<void>;
  setLayerVisible(id: string, visible: boolean): void;
  getStats(): FrameStats & { loading: number; layers: Record<string, string> };
  pickAt(x: number, y: number): ReturnType<Engine['layers']['pick']>;
  capture(): string;
  ready(): boolean;
  /** Escape hatch for debugging in automation (not a stable API). */
  engine: Engine;
}

declare global {
  interface Window {
    __stadsplattan?: TestHooks;
  }
}

export function installTestHooks(engine: Engine): void {
  window.__stadsplattan = {
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    setCamera: (pos, target) => engine.setCamera(vec(pos), vec(target)),
    setTime: (iso) => {
      if (iso === null) engine.clock.goLive();
      else engine.clock.set(new Date(iso));
    },
    setQuality: (q) => engine.setQuality(q),
    setAppMode: (m) => engine.modes.set(m),
    setLayerVisible: (id, v) => engine.layers.setVisible(id, v),
    getStats: () => {
      const s = store.get();
      return {
        ...s.stats,
        loading: s.loading,
        layers: Object.fromEntries(s.layers.map((l) => [l.id, l.state])),
      };
    },
    pickAt: (x, y) => {
      const r = engine.renderer.domElement.getBoundingClientRect();
      const rc = new THREE.Raycaster();
      rc.setFromCamera(
        new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1),
        engine.camera,
      );
      return engine.layers.pick(rc);
    },
    capture: () => engine.capture(),
    ready: () => store.get().ready,
    engine,
  };
}
