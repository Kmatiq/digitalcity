/**
 * The ONLY module that converts between coordinate systems.
 *
 * Local frame (meters, right-handed):
 *   origin = slab centre at sea level, +X = east, +Y = up, -Z = north (+Z = south).
 * The local frame is the ENU tangent plane at the origin, so it can be applied to
 * ECEF data (3D Tiles) with a single affine matrix.
 *
 * Heights: Helsinki's 3D data (terrain + 3D Tiles) stores N2000 heights in the
 * ellipsoid-height slot of ECEF, so "h" below equals N2000 and y = 0 is sea level.
 * Curvature drop at the slab edge (1 km) is ~8 cm and is shared by all layers.
 *
 * Pure math + proj4 only (no three.js) so the offline pipeline can use it too.
 */
import proj4 from 'proj4';

export type Vec3 = [number, number, number];

const A = 6378137.0; // GRS80 / WGS84 semi-major axis
const F = 1 / 298.257222101; // GRS80 flattening
const E2 = F * (2 - F);
const DEG = Math.PI / 180;

/** Projected CRSs used by city configs (all GRS80 transverse Mercator). */
const TM = (lon0: number, x0: number, k = 1): string =>
  `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=${k} +x_0=${x0} +y_0=0 +ellps=GRS80 ` +
  '+towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
proj4.defs('EPSG:3879', TM(25, 25500000)); // ETRS-GK25 (Helsinki)
proj4.defs('EPSG:3006', TM(15, 500000, 0.9996)); // SWEREF 99 TM (Sweden)
proj4.defs('EPSG:3007', TM(12, 150000)); // SWEREF 99 12 00 (Göteborg)
export type ProjectedCrs = 'EPSG:3879' | 'EPSG:3006' | 'EPSG:3007';

export interface LocalFrame {
  readonly lat0: number;
  readonly lon0: number;
  readonly origin: Vec3; // ECEF of origin
  readonly east: Vec3;
  readonly north: Vec3;
  readonly up: Vec3;
}

export function geodeticToEcef(lon: number, lat: number, h = 0): Vec3 {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const sinPhi = Math.sin(phi);
  const n = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const r = (n + h) * Math.cos(phi);
  return [r * Math.cos(lam), r * Math.sin(lam), (n * (1 - E2) + h) * sinPhi];
}

export function ecefToGeodetic(x: number, y: number, z: number): Vec3 {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - (E2 * n) / (n + h)));
  }
  return [lon / DEG, lat / DEG, h];
}

export function createFrame(lat0: number, lon0: number): LocalFrame {
  const phi = lat0 * DEG;
  const lam = lon0 * DEG;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);
  return {
    lat0,
    lon0,
    origin: geodeticToEcef(lon0, lat0, 0),
    east: [-sl, cl, 0],
    north: [-sp * cl, -sp * sl, cp],
    up: [cp * cl, cp * sl, sp],
  };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function ecefToLocal(f: LocalFrame, p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  return [dot(d, f.east), dot(d, f.up), -dot(d, f.north)];
}

export function localToEcef(f: LocalFrame, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const n = -z;
  return [
    f.origin[0] + x * f.east[0] + n * f.north[0] + y * f.up[0],
    f.origin[1] + x * f.east[1] + n * f.north[1] + y * f.up[1],
    f.origin[2] + x * f.east[2] + n * f.north[2] + y * f.up[2],
  ];
}

export function wgs84ToLocal(f: LocalFrame, lon: number, lat: number, h = 0): Vec3 {
  return ecefToLocal(f, geodeticToEcef(lon, lat, h));
}

export function localToWgs84(f: LocalFrame, p: Vec3): Vec3 {
  const e = localToEcef(f, p);
  return ecefToGeodetic(e[0], e[1], e[2]);
}

/** Column-major 4x4 matrix mapping ECEF -> local (for THREE.Matrix4.fromArray). */
export function ecefToLocalMatrix(f: LocalFrame): number[] {
  const r = [f.east, f.up, f.north.map((v) => -v) as Vec3];
  const t = r.map((row) => -dot(row, f.origin));
  return [
    r[0][0], r[1][0], r[2][0], 0,
    r[0][1], r[1][1], r[2][1], 0,
    r[0][2], r[1][2], r[2][2], 0,
    t[0], t[1], t[2], 1,
  ]; // prettier-ignore
}

/** WGS84 lon/lat -> projected [easting, northing]. */
export function wgs84ToProjected(crs: ProjectedCrs, lon: number, lat: number): [number, number] {
  const [e, n] = proj4('EPSG:4326', crs, [lon, lat]);
  return [e, n];
}

export function projectedToWgs84(crs: ProjectedCrs, e: number, n: number): [number, number] {
  const [lon, lat] = proj4(crs, 'EPSG:4326', [e, n]);
  return [lon, lat];
}

export function localToProjected(
  f: LocalFrame,
  crs: ProjectedCrs,
  x: number,
  z: number,
): [number, number] {
  const [lon, lat] = localToWgs84(f, [x, 0, z]);
  return wgs84ToProjected(crs, lon, lat);
}

export function projectedToLocal(
  f: LocalFrame,
  crs: ProjectedCrs,
  e: number,
  n: number,
  h = 0,
): Vec3 {
  const [lon, lat] = projectedToWgs84(crs, e, n);
  return wgs84ToLocal(f, lon, lat, h);
}

// Helsinki helpers (EPSG:3879), kept for readability at call sites.
export const wgs84To3879 = (lon: number, lat: number): [number, number] =>
  wgs84ToProjected('EPSG:3879', lon, lat);
export const epsg3879ToWgs84 = (e: number, n: number): [number, number] =>
  projectedToWgs84('EPSG:3879', e, n);
export const localTo3879 = (f: LocalFrame, x: number, z: number): [number, number] =>
  localToProjected(f, 'EPSG:3879', x, z);
export const epsg3879ToLocal = (f: LocalFrame, e: number, n: number, h = 0): Vec3 =>
  projectedToLocal(f, 'EPSG:3879', e, n, h);
