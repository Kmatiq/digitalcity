/** Contents of the toolbar sheets: layers, time/sun, quality. */
import type { ReactElement } from 'react';
import { useAppState } from '../core/store';
import type { QualityLevel } from '../core/types';
import { QualityPicker } from './QualityPicker';

export function LayersPanel({
  onToggle,
}: {
  onToggle(id: string, v: boolean): void;
}): ReactElement {
  const layers = useAppState((s) => s.layers);
  return (
    <ul className="list">
      {layers.map((l) => (
        <li key={l.id}>
          <label className="row">
            <input
              type="checkbox"
              checked={l.visible}
              onChange={(e) => onToggle(l.id, e.target.checked)}
            />
            <span>{l.label}</span>
            {l.isSchematic && <em className="tag">schematisk</em>}
            {l.state === 'loading' && <i className="dot" aria-label="laddar" />}
            {l.state === 'error' && <em className="tag err">fel</em>}
          </label>
        </li>
      ))}
    </ul>
  );
}

const HELSINKI_TZ = 'Europe/Helsinki';

function localParts(ms: number): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: HELSINKI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Helsinki wall-clock (date + minutes) -> epoch ms, DST-aware. */
function fromLocal(date: string, minutes: number): number {
  const guess = Date.parse(`${date}T00:00:00Z`) + minutes * 60000;
  const back = localParts(guess);
  const drift = (Date.parse(`${back.date}T00:00:00Z`) + back.minutes * 60000 - guess) / 60000;
  return guess - drift * 60000;
}

export function TimePanel({
  onTime,
  onLive,
}: {
  onTime(ms: number): void;
  onLive(): void;
}): ReactElement {
  const simTime = useAppState((s) => s.simTime);
  const isLive = useAppState((s) => s.isLive);
  const { date, minutes } = localParts(simTime);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return (
    <div className="time">
      <div className="time-head">
        <strong>
          {hh}:{mm}
        </strong>
        <button className={`chip${isLive ? ' on' : ''}`} onClick={onLive}>
          Live
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={1439}
        step={5}
        value={minutes}
        aria-label="Klockslag"
        onChange={(e) => onTime(fromLocal(date, Number(e.target.value)))}
      />
      <input
        type="date"
        value={date}
        aria-label="Datum"
        onChange={(e) => e.target.value && onTime(fromLocal(e.target.value, minutes))}
      />
    </div>
  );
}

export function QualityPanel({ onQuality }: { onQuality(q: QualityLevel): void }): ReactElement {
  const stats = useAppState((s) => s.stats);
  return (
    <div className="quality">
      <QualityPicker onChange={onQuality} />
      <dl className="stats">
        <dt>FPS</dt>
        <dd>{stats.fps}</dd>
        <dt>ms</dt>
        <dd>{stats.frameMs}</dd>
        <dt>Anrop</dt>
        <dd>{stats.drawCalls}</dd>
        <dt>Tri</dt>
        <dd>{(stats.triangles / 1e6).toFixed(2)} M</dd>
        <dt>Upplösning</dt>
        <dd>{stats.pixelRatio}×</dd>
      </dl>
    </div>
  );
}
