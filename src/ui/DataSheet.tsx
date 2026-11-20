import type { ReactElement } from 'react';
import { useAppState } from '../core/store';
import { Icon } from './icons';

/** "Mina data": the data sources, licences and status behind the current view. */
export function DataSheet({ onClose }: { onClose(): void }): ReactElement {
  const layers = useAppState((s) => s.layers);
  return (
    <section className="sheet data" aria-label="Mina data">
      <header>
        <h2>Mina data</h2>
        <button className="icon" onClick={onClose} aria-label="Stäng">
          <Icon.close />
        </button>
      </header>
      <ul className="list">
        {layers.map((l) => (
          <li key={l.id}>
            <strong>{l.label}</strong>{' '}
            <em className={`tag${l.state === 'error' ? ' err' : ''}`}>{l.state}</em>
            {l.attribution.map((a) => (
              <div key={a} className="muted">
                {a}
              </div>
            ))}
          </li>
        ))}
      </ul>
      <p className="muted">
        Öppna data från Helsingfors stad (kartta.hel.fi), licens CC BY 4.0. Havsbotten och jordlager
        är schematiska.
      </p>
    </section>
  );
}
