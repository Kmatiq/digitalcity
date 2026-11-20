import { describe, expect, it } from 'vitest';
import { geohashCells, hfpTopics, parseVp } from './hfpClient';

describe('HFP client', () => {
  it('builds topic geohash cells covering the slab', () => {
    const cells = geohashCells({
      minLat: 60.1605,
      maxLat: 60.1785,
      minLon: 24.9345,
      maxLon: 24.9705,
    });
    expect(cells).toContain('60;24/19/63');
    expect(cells).toContain('60;24/19/77');
    expect(cells).toHaveLength(10);
  });

  it('builds filtered topics per mode', () => {
    const t = hfpTopics(['tram'], ['60;24/19/64']);
    expect(t).toEqual(['/hfp/v2/journey/ongoing/vp/tram/+/+/+/+/+/+/+/+/60;24/19/64/#']);
  });

  it('parses a vehicle position (dl negative = late)', () => {
    const topic =
      '/hfp/v2/journey/ongoing/vp/tram/0040/00462/1003/2/Olympiaterm./14:43/1040438/5/60;24/19/64/50';
    const payload =
      '{"VP":{"desi":"3","dir":"2","oper":40,"veh":462,"tst":"2026-11-20T13:20:49.713Z","spd":2.52,"hdg":235,"lat":60.165452,"long":24.940123,"dl":-388,"route":"1003"}}';
    const u = parseVp(topic, payload)!;
    expect(u.id).toBe('0040/00462');
    expect(u.mode).toBe('tram');
    expect(u.line).toBe('3');
    expect(u.headsign).toBe('Olympiaterm.');
    expect(u.delay).toBe(388);
    expect(u.heading).toBe(235);
  });

  it('ignores payloads without position', () => {
    expect(
      parseVp('/hfp/v2/journey/ongoing/vp/bus/1/2/3/1/x/y/z/5/60;24/19/64', '{"VP":{}}'),
    ).toBeNull();
    expect(parseVp('/a', 'not json')).toBeNull();
  });
});
