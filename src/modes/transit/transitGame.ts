/**
 * Trafikledare (transit controller game) — prototype. Fictional incidents on real tram
 * lines; real HSL vehicles are tinted when affected. Actions: repair crew, reroute a
 * line, draw a provisional replacement bus line on the map.
 */
import * as THREE from 'three';
import type { Engine } from '../../core/engine';
import { rayGround } from '../../core/groundPick';
import { store } from '../../core/store';
import type { AppModeController, CityContext, SimTime } from '../../core/types';
import type { Pt } from '../../layers/transit/transitData';
import type { TransitLayer } from '../../layers/transit/transitLayer';
import * as rules from './gameLogic';
import { GameVisuals } from './gameVisuals';
import type { GameActions, GameView } from './gameView';

const UI_HZ = 4;
const ALERT_RADIUS = 300;

export function transitGameMode(engine: Engine): AppModeController & { actions: GameActions } {
  let ctx: CityContext | null = null;
  let layer: TransitLayer | null = null;
  let visuals: GameVisuals | null = null;
  let g = rules.newGame();
  let selected: number | null = null;
  let draft: Pt[] | null = null;
  let toast: string | null = null;
  let toastUntil = 0;
  let sinceUi = 0;

  const shortOf = (route: string): string =>
    layer?.network?.routes.find((r) => r.id === route)?.short ?? route;

  const vehiclesOnRoute = (route: string): number => {
    if (!layer?.vehicles) return 0;
    const short = shortOf(route);
    let n = 0;
    for (const v of layer.vehicles.vehicles.values())
      if (v.route === route || (v.mode === 'tram' && v.line === short)) n++;
    return n;
  };

  const say = (msg: string): void => {
    toast = msg;
    toastUntil = g.elapsed + 4;
  };

  const flyTo = (x: number, z: number, dist = 520): void => {
    const y = ctx!.groundHeight(x, z);
    const az = engine.controls.azimuth;
    const pos = new THREE.Vector3(
      x + Math.sin(az) * dist * 0.7,
      y + dist * 0.7,
      z + Math.cos(az) * dist * 0.7,
    );
    engine.controls.set(pos, new THREE.Vector3(x, y, z), false);
  };

  const publish = (): void => {
    const view: GameView = {
      phase: g.phase,
      timeLeft: rules.timeLeft(g),
      delayMin: Math.round(g.delayMin),
      costs: g.costs,
      score: rules.score(g),
      resolved: g.resolved,
      crewsFree: rules.CREWS - g.crewsBusy,
      crewsTotal: rules.CREWS,
      liveVehicles: layer?.vehicles?.vehicles.size ?? 0,
      feed: layer?.status ?? 'connecting',
      incidents: g.incidents.map((i) => ({
        id: i.id,
        label: rules.KINDS[i.kind].label,
        place: i.place,
        status: i.status,
        progress:
          i.status === 'repairing'
            ? 1 - i.repairLeft / rules.KINDS[i.kind].repair
            : i.status === 'resolved'
              ? 1
              : 0,
        repairSeconds: rules.KINDS[i.kind].repair,
        bridged: i.bridged,
        lines: i.routes.map((r) => ({
          route: r,
          short: shortOf(r),
          rerouted: i.rerouted.includes(r),
        })),
      })),
      selected,
      drawing: draft ? draft.length : null,
      toast: toast && g.elapsed < toastUntil ? toast : null,
    };
    store.set({ game: view });
  };

  const highlight = (): void => {
    const active = g.incidents.filter((i) => i.status !== 'resolved');
    if (!active.length) {
      layer?.lines?.highlight(null);
      return;
    }
    const m = new Map<string, number>();
    for (const i of active)
      for (const r of i.routes) if (!i.rerouted.includes(r)) m.set(r, 0xe5483b);
    layer?.lines?.highlight(m);
  };

  const actions: GameActions = {
    start() {
      g.phase = 'running';
      publish();
    },
    restart() {
      visuals?.dispose();
      visuals = new GameVisuals(ctx!.groundHeight, (m) => ctx!.registerMaterial(m));
      ctx!.scene.add(visuals.group);
      g = rules.newGame();
      g.phase = 'running';
      selected = null;
      draft = null;
      highlight();
      publish();
    },
    select(id) {
      selected = id;
      const i = g.incidents.find((x) => x.id === id);
      if (i) flyTo(i.x, i.z);
      publish();
    },
    sendCrew(id) {
      if (rules.sendCrew(g, id)) say('Reparationslaget är på väg');
      else say('Inga lediga lag');
      publish();
    },
    reroute(id, route) {
      if (rules.reroute(g, id, route))
        say(`Linje ${shortOf(route)} omdirigeras (−${rules.COST_REROUTE})`);
      highlight();
      publish();
    },
    beginDraw() {
      draft = [];
      store.set({ picked: null });
      publish();
    },
    undoPoint() {
      draft?.pop();
      visuals?.setDraft(draft ?? []);
      publish();
    },
    finishDraw() {
      const line = draft ? rules.addProvisionalLine(g, draft) : null;
      if (line) {
        visuals?.addLine(line);
        say(`Ersättningsbuss insatt (−${rules.COST_BUS})`);
      } else if (draft) say('Linjen är för kort');
      draft = null;
      visuals?.setDraft([]);
      publish();
    },
    cancelDraw() {
      draft = null;
      visuals?.setDraft([]);
      publish();
    },
  };

  return {
    id: 'transit_game',
    title: 'Trafikledare',
    description: 'Hantera störningar i kollektivtrafiken',
    actions,
    async setup(c) {
      ctx = c;
      layer = (engine.layers.get('transit') as TransitLayer | undefined) ?? null;
      engine.layers.setVisible('transit', true);
      visuals = new GameVisuals(c.groundHeight, (m) => c.registerMaterial(m));
      c.scene.add(visuals.group);
      g = rules.newGame();
      selected = null;
      draft = null;
      if (layer) {
        layer.tintOf = (v) => {
          for (const i of g.incidents) {
            if (i.status === 'resolved') continue;
            const hit = i.routes.some(
              (r) =>
                !i.rerouted.includes(r) &&
                (v.route === r || (v.mode === 'tram' && v.line === shortOf(r))),
            );
            if (hit) return Math.hypot(v.x - i.x, v.z - i.z) < ALERT_RADIUS ? 'alert' : 'warn';
          }
          return 'normal';
        };
      }
      engine.resetCamera();
      publish();
    },
    update(_t: SimTime, dt: number) {
      if (!ctx || !layer?.network) return;
      const limit = Math.min(ctx.bounds.halfWidth, ctx.bounds.halfDepth) - 150;
      const spawned = rules.tick(g, dt, layer.network, limit, vehiclesOnRoute);
      if (spawned) {
        say(`${rules.KINDS[spawned.kind].label} vid ${spawned.place}`);
        highlight();
      }
      const d = engine.camera.position.distanceTo(ctx.focus);
      const scale = THREE.MathUtils.clamp(d / 700, 1, 4);
      visuals?.sync(g.incidents, scale);
      visuals?.update(dt, scale);
      if (g.incidents.some((i) => i.status === 'resolved' && g.elapsed - i.resolvedAt < dt * 2))
        highlight();
      sinceUi += dt;
      if (sinceUi > 1 / UI_HZ || g.phase === 'over') {
        sinceUi = 0;
        publish();
      }
    },
    onTap(e, raycaster) {
      if (!ctx || !visuals) return;
      if (draft) {
        const p = rayGround(raycaster.ray, ctx.groundHeight);
        const b = ctx.bounds;
        if (p && Math.abs(p.x) < b.halfWidth && Math.abs(p.z) < b.halfDepth) {
          draft.push([p.x, p.z]);
          visuals.setDraft(draft);
          publish();
        }
        return;
      }
      const r = engine.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      const inc = visuals.hitIncident(g.incidents, engine.camera, ndc, r.width / r.height);
      if (inc) {
        actions.select(inc.id);
        store.set({ picked: null });
        return;
      }
      const hit = layer?.pick(raycaster);
      store.set({ picked: hit ? { ...hit, screen: { x: e.clientX, y: e.clientY } } : null });
    },
    async teardown() {
      if (layer) {
        layer.tintOf = () => 'normal';
        layer.lines?.highlight(null);
      }
      visuals?.dispose();
      visuals = null;
      store.set({ game: null, picked: null });
      ctx = null;
    },
  };
}
