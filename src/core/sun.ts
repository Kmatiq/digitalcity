/**
 * Solar position (NOAA / Meeus simplified), accurate to ~0.1 deg — enough for
 * lighting and shadows. Returns direction in the local frame (+X east, +Y up, -Z north).
 */
const DEG = Math.PI / 180;

export interface SunPosition {
  altitude: number; // radians above horizon
  azimuth: number; // radians, clockwise from north
  direction: [number, number, number]; // unit vector pointing TO the sun (local frame)
}

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * DEG) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG));

  const y = Math.tan((eps * DEG) / 2) ** 2;
  const eqTime =
    (4 / DEG) *
    (y * Math.sin(2 * l0 * DEG) -
      2 * e * Math.sin(m * DEG) +
      4 * e * y * Math.sin(m * DEG) * Math.cos(2 * l0 * DEG) -
      0.5 * y * y * Math.sin(4 * l0 * DEG) -
      1.25 * e * e * Math.sin(2 * m * DEG)); // minutes

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (((utcMinutes + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolarTime / 4 - 180) * DEG;

  const phi = lat * DEG;
  const cosZen =
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const altitude = Math.PI / 2 - zenith;
  const azimuth =
    (Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi),
    ) +
      Math.PI) %
    (2 * Math.PI);

  const ca = Math.cos(altitude);
  return {
    altitude,
    azimuth,
    direction: [ca * Math.sin(azimuth), Math.sin(altitude), -ca * Math.cos(azimuth)],
  };
}
