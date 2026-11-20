import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import {
  createFrame,
  ecefToGeodetic,
  ecefToLocal,
  ecefToLocalMatrix,
  epsg3879ToLocal,
  geodeticToEcef,
  localTo3879,
  localToProjected,
  localToWgs84,
  projectedToLocal,
  projectedToWgs84,
  wgs84To3879,
  wgs84ToLocal,
  wgs84ToProjected,
} from './coordinates';

// Slab centre (Senate Square) and Helsinki Cathedral (north side of the square).
const CENTER = { lat: 60.1695, lon: 24.9525 };
const CATHEDRAL = { lat: 60.17034, lon: 24.95224 };
const frame = createFrame(CENTER.lat, CENTER.lon);

describe('coordinates', () => {
  it('geodetic -> ECEF matches proj4 geocent', () => {
    const ref = proj4('EPSG:4326', '+proj=geocent +ellps=GRS80 +units=m', [24.9525, 60.1695, 12]);
    const ours = geodeticToEcef(24.9525, 60.1695, 12);
    ours.forEach((v, i) => expect(v).toBeCloseTo(ref[i], 3));
  });

  it('ECEF round trip is sub-millimetre', () => {
    const [lon, lat, h] = ecefToGeodetic(...geodeticToEcef(24.95, 60.17, 35.5));
    expect(lon).toBeCloseTo(24.95, 9);
    expect(lat).toBeCloseTo(60.17, 9);
    expect(h).toBeCloseTo(35.5, 4);
  });

  it('origin maps to (0,0,0)', () => {
    const p = wgs84ToLocal(frame, CENTER.lon, CENTER.lat, 0);
    p.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-6));
  });

  it('cathedral is ~93 m north (-Z) and ~14 m west (-X)', () => {
    const [x, y, z] = wgs84ToLocal(frame, CATHEDRAL.lon, CATHEDRAL.lat, 0);
    expect(z).toBeLessThan(-85);
    expect(z).toBeGreaterThan(-100);
    expect(x).toBeLessThan(-10);
    expect(x).toBeGreaterThan(-20);
    expect(Math.abs(y)).toBeLessThan(0.01);
  });

  it('east is +X, north is -Z, up is +Y', () => {
    expect(wgs84ToLocal(frame, CENTER.lon + 0.01, CENTER.lat)[0]).toBeGreaterThan(500);
    expect(wgs84ToLocal(frame, CENTER.lon, CENTER.lat + 0.01)[2]).toBeLessThan(-1000);
    expect(wgs84ToLocal(frame, CENTER.lon, CENTER.lat, 20)[1]).toBeCloseTo(20, 3);
  });

  it('local <-> WGS84 round trip at slab corner', () => {
    const p: [number, number, number] = [1000, 15, -1000];
    const [lon, lat, h] = localToWgs84(frame, p);
    const q = wgs84ToLocal(frame, lon, lat, h);
    q.forEach((v, i) => expect(v).toBeCloseTo(p[i], 4));
  });

  it('EPSG:3879 centre and local round trip', () => {
    const [e, n] = wgs84To3879(CENTER.lon, CENTER.lat);
    expect(e).toBeGreaterThan(25497300);
    expect(e).toBeLessThan(25497420);
    expect(n).toBeGreaterThan(6672900);
    expect(n).toBeLessThan(6673000);
    const [e2, n2] = localTo3879(frame, 500, -700);
    const back = epsg3879ToLocal(frame, e2, n2, 0);
    expect(back[0]).toBeCloseTo(500, 3);
    expect(back[2]).toBeCloseTo(-700, 3);
  });

  it('SWEREF 99 12 00 (EPSG:3007): Gustaf Adolfs torg and round trip', () => {
    // Göteborg: Gustaf Adolfs torg ≈ E 148 020, N 6 398 670 in SWEREF 99 12 00
    const [e, n] = wgs84ToProjected('EPSG:3007', 11.9668, 57.7072);
    expect(e).toBeGreaterThan(147950);
    expect(e).toBeLessThan(148090);
    expect(n).toBeGreaterThan(6398600);
    expect(n).toBeLessThan(6398740);
    const g = createFrame(57.7072, 11.9668);
    const [e2, n2] = localToProjected(g, 'EPSG:3007', -300, 450);
    const back = projectedToLocal(g, 'EPSG:3007', e2, n2);
    expect(back[0]).toBeCloseTo(-300, 3);
    expect(back[2]).toBeCloseTo(450, 3);
    // SWEREF 99 TM vs 12 00 differ but describe the same point
    const [lon, lat] = projectedToWgs84(
      'EPSG:3006',
      ...wgs84ToProjected('EPSG:3006', 11.9668, 57.7072),
    );
    expect(lon).toBeCloseTo(11.9668, 7);
    expect(lat).toBeCloseTo(57.7072, 7);
  });

  it('ECEF->local matrix equals ecefToLocal', () => {
    const m = ecefToLocalMatrix(frame);
    const p = geodeticToEcef(24.96, 60.165, 22);
    const exp = ecefToLocal(frame, p);
    const got = [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
    got.forEach((v, i) => expect(v).toBeCloseTo(exp[i], 4));
  });
});
