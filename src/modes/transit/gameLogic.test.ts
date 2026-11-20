import { describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../layers/transit/transitData';
import {
  addProvisionalLine,
  COST_BUS,
  COST_REROUTE,
  CREWS,
  newGame,
  reroute,
  score,
  sendCrew,
  SHIFT_S,
  spawnIncident,
  tick,
  type GameState,
} from './gameLogic';

const net: TransitNetwork = {
  routes: [
    { id: '1002', short: '2', long: '', mode: 'tram' },
    { id: '1003', short: '3', long: '', mode: 'tram' },
    { id: '2550', short: '550', long: '', mode: 'bus' },
  ],
  shapes: [
    {
      route: '1002',
      dir: 0,
      headsign: 'A',
      pts: [
        [-500, 0],
        [500, 0],
      ],
    },
    {
      route: '1003',
      dir: 0,
      headsign: 'B',
      pts: [
        [-500, 5],
        [500, 5],
      ],
    },
    {
      route: '2550',
      dir: 0,
      headsign: 'C',
      pts: [
        [0, -500],
        [0, 500],
      ],
    },
  ],
  stops: [{ id: 's', name: 'Senaatintori', x: 0, z: 0, mode: 'tram' }],
};

function running(): GameState {
  const g = newGame();
  g.phase = 'running';
  return g;
}

describe('Trafikledare rules', () => {
  it('spawns incidents on tram lines only, affecting nearby tram routes', () => {
    const g = running();
    const i = spawnIncident(g, net, 800, () => 0.5)!;
    expect(i).not.toBeNull();
    expect(Math.abs(i.z)).toBeLessThan(6);
    expect(i.routes.sort()).toEqual(['1002', '1003']);
    expect(i.place).toBe('Senaatintori');
  });

  it('accumulates passenger delay per affected line and halves it when bridged', () => {
    const g = running();
    g.nextSpawn = 1e9;
    const i = spawnIncident(g, net, 800, () => 0.5)!;
    g.incidents.push(i);
    tick(g, 60, net, 800, () => 1);
    expect(g.delayMin).toBeCloseTo(2 * 70, 5); // two routes x 70 passengers x 1 min
    addProvisionalLine(g, [
      [i.x - 100, i.z + 30],
      [i.x + 100, i.z + 30],
    ]);
    const before = g.delayMin;
    tick(g, 60, net, 800, () => 1);
    expect(g.delayMin - before).toBeCloseTo(70, 5);
    expect(g.costs).toBe(COST_BUS);
  });

  it('rerouting stops accumulation for that line and costs points', () => {
    const g = running();
    g.nextSpawn = 1e9;
    const i = spawnIncident(g, net, 800, () => 0.5)!;
    g.incidents.push(i);
    reroute(g, i.id, '1002');
    reroute(g, i.id, '1003');
    tick(g, 30, net, 800, () => 3);
    expect(g.delayMin).toBe(0);
    expect(g.costs).toBe(2 * COST_REROUTE);
  });

  it('crews repair incidents and are limited', () => {
    const g = running();
    g.nextSpawn = 1e9;
    const base = spawnIncident(g, net, 800, () => 0.5)!;
    for (let k = 0; k < 3; k++)
      g.incidents.push({ ...base, id: 100 + k, x: k * 300, rerouted: [] });
    const ids = g.incidents.map((i) => i.id);
    expect(sendCrew(g, ids[0])).toBe(true);
    expect(sendCrew(g, ids[1])).toBe(true);
    expect(sendCrew(g, ids[2])).toBe(false);
    expect(g.crewsBusy).toBe(CREWS);
    tick(g, 61, net, 800, () => 1);
    expect(g.resolved).toBe(2);
    expect(g.crewsBusy).toBe(0);
    expect(score(g)).toBeGreaterThan(10000);
  });

  it('ends the shift after SHIFT_S seconds', () => {
    const g = running();
    g.nextSpawn = 1e9;
    tick(g, SHIFT_S + 1, net, 800, () => 1);
    expect(g.phase).toBe('over');
  });
});
