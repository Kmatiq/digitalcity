/** Tiny observable store shared by engine and React UI (useSyncExternalStore). */
import { useSyncExternalStore } from 'react';
import type { AppMode, FrameStats, PickResult, QualityLevel } from './types';
import type { GameView } from '../modes/transit/gameView';

export interface LayerStatus {
  id: string;
  label: string;
  visible: boolean;
  state: 'idle' | 'loading' | 'ready' | 'error';
  attribution: string[];
  isSchematic?: boolean;
  credit?: string;
  message?: string;
}

export interface AppState {
  mode: AppMode;
  quality: QualityLevel;
  simTime: number; // ms epoch
  isLive: boolean;
  stats: FrameStats;
  picked: (PickResult & { screen: { x: number; y: number } }) | null;
  layers: LayerStatus[];
  loading: number; // outstanding requests
  ready: boolean;
  error: string | null;
  game: GameView | null;
}

type Listener = () => void;

class Store {
  private state: AppState = {
    mode: 'menu',
    quality: 'medium',
    simTime: Date.now(),
    isLive: true,
    stats: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, pixelRatio: 1 },
    picked: null,
    layers: [],
    loading: 0,
    ready: false,
    error: null,
    game: null,
  };
  private listeners = new Set<Listener>();

  get = (): AppState => this.state;

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  setLayer(id: string, patch: Partial<LayerStatus>): void {
    this.set({ layers: this.state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const store = new Store();

export function useAppState<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
