import { useEffect, useRef, useState, type ReactElement } from 'react';
import { getEngine, getGameActions, saveQuality, startApp } from '../app';
import { CITIES, getCity } from '../cities/cityConfig';
import { store, useAppState } from '../core/store';
import type { AppMode, QualityLevel } from '../core/types';
import { Corner } from './Corner';
import { DataSheet } from './DataSheet';
import { Hud, type HudActions } from './Hud';
import { InfoCard } from './InfoCard';
import { StartMenu } from './StartMenu';
import { TransitHud } from './game/TransitHud';

const city = getCity(new URLSearchParams(location.search).get('city') ?? 'helsinki');

export function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mode = useAppState((s) => s.mode);
  const error = useAppState((s) => s.error);
  const [dataOpen, setDataOpen] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || getEngine()) return;
    startApp(canvasRef.current).catch((e) => {
      console.error(e);
      store.set({ error: 'Kunde inte starta 3D-vyn.' });
    });
  }, []);

  const setQuality = (q: QualityLevel): void => {
    getEngine()?.setQuality(q);
    saveQuality(q);
  };
  const setMode = (m: AppMode): void => {
    setDataOpen(false);
    void getEngine()?.modes.set(m);
  };
  const actions: HudActions = {
    home: () => setMode('menu'),
    resetCamera: () => getEngine()?.resetCamera(),
    toggleLayer: (id, v) => getEngine()?.layers.setVisible(id, v),
    setTime: (ms) => getEngine()?.clock.set(new Date(ms)),
    goLive: () => getEngine()?.clock.goLive(),
    setQuality,
  };

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      <div className={`ui mode-${mode}`}>
        {mode === 'menu' && !dataOpen && (
          <StartMenu
            cityName={city.name}
            cityId={city.id}
            cities={Object.values(CITIES).map((c) => ({ id: c.id, name: c.name }))}
            lockedModes={city.layers.transit ? [] : ['transit_game']}
            onSelect={setMode}
            onQuality={setQuality}
            onData={() => setDataOpen(true)}
          />
        )}
        {dataOpen && <DataSheet onClose={() => setDataOpen(false)} />}
        {mode === 'explore' && (
          <>
            <Hud actions={actions} />
            <InfoCard onClose={() => store.set({ picked: null })} />
          </>
        )}
        {mode === 'transit_game' && getGameActions() && (
          <>
            <TransitHud
              actions={getGameActions()!}
              onHome={actions.home}
              onResetCamera={actions.resetCamera}
            />
            <InfoCard onClose={() => store.set({ picked: null })} />
          </>
        )}
        <Corner cityAttribution={city.attribution} />
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}
