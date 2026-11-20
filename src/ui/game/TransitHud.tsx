/** Trafikledare HUD: status bar, incident chips, action panel, draw mode, intro/result. */
import type { ReactElement } from 'react';
import { useAppState } from '../../core/store';
import type { GameActions, GameView, IncidentView } from '../../modes/transit/gameView';
import { Icon } from '../icons';

const fmtTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtNum = (n: number): string => n.toLocaleString('sv-SE');

function TopBar({ g }: { g: GameView }): ReactElement {
  return (
    <div className="g-top" role="status">
      <span className={g.timeLeft < 30 ? 'warn' : ''}>⏱ {fmtTime(g.timeLeft)}</span>
      <span title="Försenade resenärsminuter">⌛ {fmtNum(g.delayMin)}</span>
      <span title="Lediga reparationslag">
        🛠 {g.crewsFree}/{g.crewsTotal}
      </span>
      <strong title="Poäng">{fmtNum(g.score)}</strong>
    </div>
  );
}

function Chips({ g, a }: { g: GameView; a: GameActions }): ReactElement | null {
  if (!g.incidents.length) return null;
  return (
    <div className="g-chips">
      {g.incidents.map((i) => (
        <button
          key={i.id}
          className={`g-chip ${i.status}${g.selected === i.id ? ' sel' : ''}`}
          onClick={() => a.select(i.id)}
        >
          {i.label}
          <small>{i.lines.map((l) => l.short).join(' · ')}</small>
        </button>
      ))}
    </div>
  );
}

function IncidentPanel({
  i,
  g,
  a,
}: {
  i: IncidentView;
  g: GameView;
  a: GameActions;
}): ReactElement {
  const repairing = i.status === 'repairing';
  return (
    <section className="sheet g-panel" aria-label="Störning">
      <header>
        <h2>
          {i.label} <span className="muted">vid {i.place}</span>
        </h2>
        <button className="icon" onClick={() => a.select(null)} aria-label="Stäng">
          <Icon.close />
        </button>
      </header>
      {i.status === 'resolved' ? (
        <p className="ok">Åtgärdad ✓</p>
      ) : (
        <>
          <div className="g-progress" aria-label="Reparation">
            <i style={{ width: `${Math.round(i.progress * 100)}%` }} />
          </div>
          <button
            className="g-act primary"
            disabled={i.status !== 'active' || g.crewsFree === 0}
            onClick={() => a.sendCrew(i.id)}
          >
            🛠 {repairing ? 'Reparation pågår…' : `Skicka reparationslag (${i.repairSeconds} s)`}
          </button>
          <div className="g-lines">
            {i.lines.map((l) => (
              <button
                key={l.route}
                className={`g-line${l.rerouted ? ' on' : ''}`}
                disabled={l.rerouted}
                onClick={() => a.reroute(i.id, l.route)}
                title="Omdirigera linjen förbi störningen (−150)"
              >
                {l.rerouted ? `↪ ${l.short} omdirigerad` : `↪ Omdirigera ${l.short}`}
              </button>
            ))}
          </div>
          <button className="g-act" onClick={a.beginDraw}>
            🚌 Rita ersättningsbuss (−300)
            {i.bridged && <em className="tag">aktiv</em>}
          </button>
        </>
      )}
    </section>
  );
}

function DrawBanner({ n, a }: { n: number; a: GameActions }): ReactElement {
  return (
    <div className="g-draw">
      <span>Tryck på kartan · {n} hållplatser</span>
      <button onClick={a.undoPoint} disabled={n === 0}>
        Ångra
      </button>
      <button onClick={a.cancelDraw}>Avbryt</button>
      <button className="primary" onClick={a.finishDraw} disabled={n < 2}>
        Klar
      </button>
    </div>
  );
}

function Intro({ g, a, onHome }: { g: GameView; a: GameActions; onHome(): void }): ReactElement {
  return (
    <div className="menu g-card">
      <h1>Trafikledare</h1>
      <p className="muted">
        {g.feed === 'live'
          ? `${g.liveVehicles} fordon live.`
          : g.feed === 'offline'
            ? 'Realtidsflödet är offline.'
            : 'Ansluter till realtidsflödet…'}{' '}
        Störningarna är fiktiva — trafiken är verklig.
      </p>
      <ul className="g-rules">
        <li>🛠 Skicka reparationslag</li>
        <li>↪ Omdirigera drabbade linjer</li>
        <li>🚌 Rita en ersättningsbuss förbi störningen</li>
      </ul>
      <p className="muted">Pass 5 min · minimera försenade resenärsminuter.</p>
      <div className="g-row">
        <button className="link" onClick={onHome}>
          <Icon.home /> Meny
        </button>
        <button className="g-act primary" onClick={a.start}>
          Starta pass
        </button>
      </div>
    </div>
  );
}

function Result({ g, a, onHome }: { g: GameView; a: GameActions; onHome(): void }): ReactElement {
  return (
    <div className="menu g-card">
      <h1>Passet är slut</h1>
      <p className="g-score">{fmtNum(g.score)} p</p>
      <dl className="stats">
        <dt>Åtgärdade störningar</dt>
        <dd>{g.resolved}</dd>
        <dt>Försenade resenärsminuter</dt>
        <dd>{fmtNum(g.delayMin)}</dd>
        <dt>Kostnader</dt>
        <dd>{fmtNum(g.costs)}</dd>
      </dl>
      <div className="g-row">
        <button className="link" onClick={onHome}>
          <Icon.home /> Meny
        </button>
        <button className="g-act primary" onClick={a.restart}>
          Spela igen
        </button>
      </div>
    </div>
  );
}

export function TransitHud({
  actions,
  onHome,
  onResetCamera,
}: {
  actions: GameActions;
  onHome(): void;
  onResetCamera(): void;
}): ReactElement | null {
  const g = useAppState((s) => s.game);
  if (!g) return null;
  if (g.phase === 'intro') return <Intro g={g} a={actions} onHome={onHome} />;
  if (g.phase === 'over') return <Result g={g} a={actions} onHome={onHome} />;
  const sel = g.incidents.find((i) => i.id === g.selected);
  return (
    <>
      <TopBar g={g} />
      <Chips g={g} a={actions} />
      {g.toast && <div className="g-toast">{g.toast}</div>}
      {g.drawing !== null ? (
        <DrawBanner n={g.drawing} a={actions} />
      ) : (
        sel && <IncidentPanel i={sel} g={g} a={actions} />
      )}
      <nav className="toolbar" aria-label="Verktyg">
        <button onClick={onHome} aria-label="Meny" title="Meny">
          <Icon.home />
        </button>
        <button onClick={onResetCamera} aria-label="Återställ kamera" title="Återställ kamera">
          <Icon.target />
        </button>
      </nav>
    </>
  );
}
