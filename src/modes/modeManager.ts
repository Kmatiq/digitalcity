import type * as THREE from 'three';
import { store } from '../core/store';
import type { AppMode, AppModeController, CityContext, SimTime } from '../core/types';

/** Sets up / tears down app modes without touching the underlying 3D world. */
export class ModeManager {
  private modes = new Map<AppMode, AppModeController>();
  private active: AppModeController | null = null;
  private switching: Promise<void> = Promise.resolve();

  constructor(private ctx: CityContext) {}

  register(m: AppModeController): void {
    this.modes.set(m.id, m);
  }

  list(): AppModeController[] {
    return [...this.modes.values()];
  }

  get current(): AppModeController | null {
    return this.active;
  }

  set(id: AppMode): Promise<void> {
    this.switching = this.switching.then(async () => {
      const next = this.modes.get(id);
      if (!next) throw new Error(`Unknown mode ${id}`);
      if (next.locked) return;
      if (this.active?.id === id) return;
      await this.active?.teardown();
      this.active = next;
      store.set({ mode: id, picked: null });
      await next.setup(this.ctx);
    });
    return this.switching;
  }

  update(t: SimTime, dt: number): void {
    this.active?.update(t, dt);
  }

  tap(e: PointerEvent, raycaster: THREE.Raycaster): void {
    this.active?.onTap?.(e, raycaster);
  }
}
