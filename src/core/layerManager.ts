import type * as THREE from 'three';
import { store } from './store';
import { isAbort } from './fetchQueue';
import type { CityContext, Layer, PickResult, QualityLevel, SimTime } from './types';

/** Loads, updates and disposes layers; mirrors their status into the UI store. */
export class LayerManager {
  readonly layers: Layer[] = [];
  private abort = new AbortController();

  constructor(private ctx: CityContext) {}

  add(layer: Layer): void {
    this.layers.push(layer);
    store.set({
      layers: [
        ...store.get().layers,
        {
          id: layer.id,
          label: layer.label,
          visible: layer.visible,
          state: 'idle',
          attribution: layer.attribution,
          isSchematic: layer.isSchematic,
          credit: layer.credit,
        },
      ],
    });
  }

  async loadAll(quality: QualityLevel): Promise<void> {
    await Promise.all(
      this.layers.map(async (l) => {
        store.setLayer(l.id, { state: 'loading' });
        try {
          l.setQuality(quality);
          await l.load(this.ctx, this.abort.signal);
          store.setLayer(l.id, { state: 'ready' });
        } catch (e) {
          if (isAbort(e)) return;
          console.warn(`[layer ${l.id}] failed to load`, e);
          store.setLayer(l.id, { state: 'error', message: String(e) });
        }
      }),
    );
  }

  get(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  setVisible(id: string, v: boolean): void {
    const l = this.get(id);
    if (!l) return;
    l.setVisible(v);
    store.setLayer(id, { visible: v });
  }

  setQuality(q: QualityLevel): void {
    this.layers.forEach((l) => l.setQuality(q));
  }

  update(t: SimTime, dt: number): void {
    for (const l of this.layers) if (l.visible) l.update(t, dt);
  }

  pending(): number {
    return this.layers.reduce((n, l) => n + (l.visible && l.pending ? l.pending() : 0), 0);
  }

  pick(raycaster: THREE.Raycaster): PickResult | null {
    let best: (PickResult & { distance: number }) | null = null;
    for (const l of this.layers) {
      if (!l.visible || !l.pick) continue;
      const r = l.pick(raycaster);
      if (r && (!best || r.distance < best.distance)) best = r;
    }
    return best;
  }

  dispose(): void {
    this.abort.abort();
    this.layers.forEach((l) => l.dispose());
    this.layers.length = 0;
  }
}
