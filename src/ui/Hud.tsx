/** Explore-mode HUD: compact toolbar + one sheet at a time (bottom sheet on narrow screens). */
import { useState, type ReactElement } from 'react';
import type { QualityLevel } from '../core/types';
import { Icon } from './icons';
import { LayersPanel, QualityPanel, TimePanel } from './Panels';

type Sheet = 'layers' | 'time' | 'quality' | null;

export interface HudActions {
  home(): void;
  resetCamera(): void;
  toggleLayer(id: string, v: boolean): void;
  setTime(ms: number): void;
  goLive(): void;
  setQuality(q: QualityLevel): void;
}

const TITLES: Record<Exclude<Sheet, null>, string> = {
  layers: 'Lager',
  time: 'Tid & sol',
  quality: 'Kvalitet',
};

export function Hud({ actions }: { actions: HudActions }): ReactElement {
  const [sheet, setSheet] = useState<Sheet>(null);
  const toggle = (s: Exclude<Sheet, null>): void => setSheet((cur) => (cur === s ? null : s));
  const btn = (s: Exclude<Sheet, null>, icon: () => ReactElement): ReactElement => (
    <button
      className={sheet === s ? 'on' : ''}
      onClick={() => toggle(s)}
      aria-label={TITLES[s]}
      title={TITLES[s]}
    >
      {icon()}
    </button>
  );
  return (
    <>
      {sheet && (
        <section className="sheet" aria-label={TITLES[sheet]}>
          <header>
            <h2>{TITLES[sheet]}</h2>
            <button className="icon" onClick={() => setSheet(null)} aria-label="Stäng">
              <Icon.close />
            </button>
          </header>
          {sheet === 'layers' && <LayersPanel onToggle={actions.toggleLayer} />}
          {sheet === 'time' && <TimePanel onTime={actions.setTime} onLive={actions.goLive} />}
          {sheet === 'quality' && <QualityPanel onQuality={actions.setQuality} />}
        </section>
      )}
      <nav className="toolbar" aria-label="Verktyg">
        <button onClick={actions.home} aria-label="Meny" title="Meny">
          <Icon.home />
        </button>
        {btn('layers', Icon.layers)}
        {btn('time', Icon.sun)}
        {btn('quality', Icon.gauge)}
        <button
          onClick={actions.resetCamera}
          aria-label="Återställ kamera"
          title="Återställ kamera"
        >
          <Icon.target />
        </button>
      </nav>
    </>
  );
}
