/** Composition root: builds the engine, layers and modes for a city. */
import { getCity } from './cities/cityConfig';
import { Engine } from './core/engine';
import { defaultQuality } from './core/quality';
import { store } from './core/store';
import { installTestHooks } from './core/testHooks';
import { QUALITY_LEVELS, type QualityLevel } from './core/types';
import { BuildingsLayer } from './layers/buildings/buildingsLayer';
import { SlabLayer } from './layers/slab/slabLayer';
import { TerrainLayer } from './layers/terrain/terrainLayer';
import { TransitLayer } from './layers/transit/transitLayer';
import { WaterLayer } from './layers/water/waterLayer';
import { exploreMode, lockedMode, menuMode } from './modes/modes';
import type { GameActions } from './modes/transit/gameView';
import { transitGameMode } from './modes/transit/transitGame';

let engine: Engine | null = null;
let gameActions: GameActions | null = null;

export function getGameActions(): GameActions | null {
  return gameActions;
}

export function getEngine(): Engine | null {
  return engine;
}

function initialQuality(): QualityLevel {
  const q = new URLSearchParams(location.search).get('quality') as QualityLevel | null;
  if (q && QUALITY_LEVELS.includes(q)) return q;
  try {
    const saved = localStorage.getItem('stadsplattan.quality') as QualityLevel | null;
    if (saved && QUALITY_LEVELS.includes(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return defaultQuality();
}

export async function startApp(canvas: HTMLCanvasElement): Promise<Engine> {
  const params = new URLSearchParams(location.search);
  const city = getCity(params.get('city') ?? 'helsinki');
  const e = new Engine(canvas, city);
  engine = e;
  installTestHooks(e);
  await e.init(initialQuality());

  e.layers.add(new SlabLayer());
  e.layers.add(new TerrainLayer(city));
  e.layers.add(new WaterLayer(city));
  e.layers.add(new BuildingsLayer(city));
  e.layers.add(new TransitLayer(city));

  e.modes.register(menuMode(e));
  e.modes.register(exploreMode(e));
  e.modes.register(lockedMode('rescue_game', 'Räddningsuppdrag', 'Skicka utryckningsfordon'));
  const transitGame = transitGameMode(e);
  gameActions = transitGame.actions;
  e.modes.register(transitGame);
  e.modes.register(lockedMode('history', 'Tidsresenären', 'Staden 1932 – idag'));

  const t = params.get('time');
  if (t) e.clock.set(new Date(t));
  const startMode = params.get('mode');
  const allowed = ['explore', 'transit_game'];
  await e.modes.set(startMode && allowed.includes(startMode) ? (startMode as 'explore') : 'menu');
  e.start();
  e.layers.loadAll(store.get().quality).then(() => store.set({ ready: true }));
  return e;
}

export function saveQuality(q: QualityLevel): void {
  try {
    localStorage.setItem('stadsplattan.quality', q);
  } catch {
    /* ignore */
  }
}
