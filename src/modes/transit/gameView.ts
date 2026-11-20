/** UI snapshot of the Trafikledare game (kept in the store, refreshed a few times/s). */
export interface IncidentView {
  id: number;
  label: string;
  place: string;
  status: 'active' | 'repairing' | 'resolved';
  progress: number; // 0..1 while repairing
  repairSeconds: number;
  bridged: boolean;
  lines: { route: string; short: string; rerouted: boolean }[];
}

export interface GameView {
  phase: 'intro' | 'running' | 'over';
  timeLeft: number;
  delayMin: number;
  costs: number;
  score: number;
  resolved: number;
  crewsFree: number;
  crewsTotal: number;
  liveVehicles: number;
  feed: string;
  incidents: IncidentView[];
  selected: number | null;
  drawing: number | null; // points placed, null = not drawing
  toast: string | null;
}

export interface GameActions {
  start(): void;
  restart(): void;
  select(id: number | null): void;
  sendCrew(id: number): void;
  reroute(id: number, route: string): void;
  beginDraw(): void;
  finishDraw(): void;
  cancelDraw(): void;
  undoPoint(): void;
}
