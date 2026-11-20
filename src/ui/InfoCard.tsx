import type { ReactElement } from 'react';
import { useAppState } from '../core/store';
import { Icon } from './icons';

/** Small floating card for the picked feature, kept inside the viewport. */
export function InfoCard({ onClose }: { onClose(): void }): ReactElement | null {
  const picked = useAppState((s) => s.picked);
  if (!picked) return null;
  const rows = Object.entries(picked.properties).filter(([, v]) => v !== null && v !== '');
  const W = 240;
  const narrow = window.innerWidth < 600;
  const style = narrow
    ? undefined
    : {
        left: Math.min(window.innerWidth - W - 12, Math.max(12, picked.screen.x + 14)),
        top: Math.min(window.innerHeight - 220, Math.max(12, picked.screen.y - 20)),
        width: W,
      };
  return (
    <aside className={`card${narrow ? ' docked' : ''}`} style={style} aria-live="polite">
      <header>
        <h3>{picked.title}</h3>
        <button className="icon" onClick={onClose} aria-label="Stäng">
          <Icon.close />
        </button>
      </header>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
