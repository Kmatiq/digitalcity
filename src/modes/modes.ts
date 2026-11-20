/** App modes for milestone 1: menu (orbiting showcase), explore, and locked games. */
import type * as THREE from 'three';
import type { Engine } from '../core/engine';
import { store } from '../core/store';
import type { AppMode, AppModeController, CityContext, SimTime } from '../core/types';

export function menuMode(engine: Engine): AppModeController {
  return {
    id: 'menu',
    title: 'Meny',
    description: 'Startmeny med snurrande diorama',
    async setup() {
      engine.controls.autoRotate = 0.05;
      engine.controls.enabled = !engine.headless;
      engine.menuFraming = true;
      engine.resize();
    },
    update() {},
    async teardown() {
      engine.controls.autoRotate = 0;
      engine.controls.enabled = true;
      engine.menuFraming = false;
      engine.resize();
    },
  };
}

export function exploreMode(engine: Engine): AppModeController {
  let ctx: CityContext | null = null;
  return {
    id: 'explore',
    title: 'Digital Tvilling',
    description: 'Utforska, klicka på byggnader',
    async setup(c) {
      ctx = c;
      engine.controls.enabled = true;
    },
    update(_t: SimTime) {},
    onTap(e: PointerEvent, raycaster: THREE.Raycaster) {
      if (!ctx) return;
      const hit = engine.layers.pick(raycaster);
      store.set({ picked: hit ? { ...hit, screen: { x: e.clientX, y: e.clientY } } : null });
    },
    async teardown() {
      store.set({ picked: null });
      ctx = null;
    },
  };
}

export function lockedMode(id: AppMode, title: string, description: string): AppModeController {
  return {
    id,
    title,
    description,
    locked: true,
    async setup() {},
    update() {},
    async teardown() {},
  };
}
