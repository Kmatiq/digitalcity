import type { ReactElement } from 'react';
import type { AppMode, QualityLevel } from '../core/types';
import { Icon } from './icons';
import { QualityPicker } from './QualityPicker';

interface Props {
  cityName: string;
  cityId: string;
  cities: { id: string; name: string }[];
  /** Locked game modes for this city (e.g. no live transit data yet). */
  lockedModes: AppMode[];
  onSelect(mode: AppMode): void;
  onQuality(q: QualityLevel): void;
  onData(): void;
}

const ENTRIES: {
  id: AppMode;
  title: string;
  sub: string;
  icon: () => ReactElement;
  locked: boolean;
}[] = [
  { id: 'explore', title: 'Digital Tvilling', sub: 'Utforska', icon: Icon.globe, locked: false },
  { id: 'rescue_game', title: 'Räddningsuppdrag', sub: 'Spel', icon: Icon.siren, locked: true },
  {
    id: 'transit_game',
    title: 'Trafikledare',
    sub: 'Spel · prototyp',
    icon: Icon.tram,
    locked: false,
  },
  { id: 'history', title: 'Historiska reglaget', sub: 'Historia', icon: Icon.clock, locked: true },
];

function switchCity(id: string): void {
  const q = new URLSearchParams(location.search);
  q.set('city', id);
  location.search = q.toString();
}

export function StartMenu({
  cityName,
  cityId,
  cities,
  lockedModes,
  onSelect,
  onQuality,
  onData,
}: Props): ReactElement {
  return (
    <div className="menu" role="dialog" aria-label="Startmeny">
      <header className="menu-head">
        <h1>Stadsplattan</h1>
        <p>{cityName} · 2 × 2 km</p>
        <div className="seg compact city-pick" role="radiogroup" aria-label="Stad">
          {cities.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={c.id === cityId}
              className={c.id === cityId ? 'on' : ''}
              onClick={() => c.id !== cityId && switchCity(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </header>
      <nav className="menu-grid">
        {ENTRIES.map((entry) => ({
          ...entry,
          locked: entry.locked || lockedModes.includes(entry.id),
        })).map((e) => (
          <button
            key={e.id}
            className={`menu-card${e.locked ? ' locked' : ''}`}
            disabled={e.locked}
            onClick={() => onSelect(e.id)}
            data-mode={e.id}
          >
            <span className="menu-icon">{e.icon()}</span>
            <span className="menu-title">{e.title}</span>
            <span className="menu-sub">
              {e.locked ? (
                <>
                  <Icon.lock /> Kommer
                </>
              ) : (
                e.sub
              )}
            </span>
          </button>
        ))}
      </nav>
      <footer className="menu-foot">
        <QualityPicker onChange={onQuality} compact />
        <button className="link" onClick={onData}>
          <Icon.data /> Mina data
        </button>
      </footer>
    </div>
  );
}
