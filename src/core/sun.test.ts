import { describe, expect, it } from 'vitest';
import { sunPosition } from './sun';

const LAT = 60.1695;
const LON = 24.9525;
const toDeg = (r: number): number => (r * 180) / Math.PI;

describe('sunPosition (Helsinki)', () => {
  it('summer solstice solar noon: altitude ~53.3 deg, due south', () => {
    // Solar noon in Helsinki ~ 10:23 UTC on 21 June.
    const s = sunPosition(new Date('2026-06-21T10:23:00Z'), LAT, LON);
    expect(toDeg(s.altitude)).toBeGreaterThan(52.8);
    expect(toDeg(s.altitude)).toBeLessThan(53.8);
    expect(toDeg(s.azimuth)).toBeGreaterThan(175);
    expect(toDeg(s.azimuth)).toBeLessThan(185);
    expect(s.direction[2]).toBeGreaterThan(0); // south = +Z
  });

  it('winter solstice solar noon: altitude ~6.4 deg', () => {
    const s = sunPosition(new Date('2026-12-21T10:20:00Z'), LAT, LON);
    expect(toDeg(s.altitude)).toBeGreaterThan(5.8);
    expect(toDeg(s.altitude)).toBeLessThan(7.0);
  });

  it('equinox morning sun is in the east (+X)', () => {
    const s = sunPosition(new Date('2026-03-20T06:00:00Z'), LAT, LON);
    expect(s.direction[0]).toBeGreaterThan(0.5);
  });

  it('is below horizon at midnight in December', () => {
    const s = sunPosition(new Date('2026-12-21T22:20:00Z'), LAT, LON);
    expect(s.altitude).toBeLessThan(0);
  });
});
