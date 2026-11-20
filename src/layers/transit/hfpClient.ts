/**
 * HSL High-Frequency Positioning (HFP v2) over MQTT/WebSocket. Subscribes ONLY to the
 * topic geohash cells (0.01° x 0.01°) covering the slab, per transport mode — never to
 * the whole /hfp/v2/journey/# firehose.
 */
import type { MqttClient } from 'mqtt';
import type { TransitMode } from './transitData';

export interface VehicleUpdate {
  id: string; // operator/vehicle
  mode: TransitMode;
  line: string; // desi, e.g. "4" or "550"
  route: string; // GTFS route_id, e.g. "1004"
  dir: number;
  headsign: string;
  lat: number;
  lon: number;
  speed: number; // m/s
  heading: number; // degrees clockwise from north
  delay: number | null; // seconds LATE (HFP dl is negative when late)
  tst: number; // ms epoch of the sample
}

export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Topic geohash prefixes like "60;24/16/95" for every 0.01° cell intersecting the bounds. */
export function geohashCells(b: LatLonBounds): string[] {
  const cells: string[] = [];
  for (let la = Math.floor(b.minLat * 100); la <= Math.floor(b.maxLat * 100); la++) {
    for (let lo = Math.floor(b.minLon * 100); lo <= Math.floor(b.maxLon * 100); lo++) {
      const li = Math.floor(la / 100);
      const oi = Math.floor(lo / 100);
      const ld = String(la % 100).padStart(2, '0');
      const od = String(lo % 100).padStart(2, '0');
      cells.push(`${li};${oi}/${ld[0]}${od[0]}/${ld[1]}${od[1]}`);
    }
  }
  return cells;
}

export function hfpTopics(modes: TransitMode[], cells: string[]): string[] {
  const out: string[] = [];
  for (const m of modes) {
    for (const c of cells) out.push(`/hfp/v2/journey/ongoing/vp/${m}/+/+/+/+/+/+/+/+/${c}/#`);
  }
  return out;
}

interface VpPayload {
  VP?: {
    desi?: string;
    dir?: string;
    oper?: number;
    veh?: number;
    tst?: string;
    spd?: number | null;
    hdg?: number | null;
    lat?: number | null;
    long?: number | null;
    dl?: number | null;
    route?: string;
  };
}

export function parseVp(topic: string, payload: string): VehicleUpdate | null {
  const parts = topic.split('/');
  const mode = parts[6] as TransitMode;
  let vp: VpPayload['VP'];
  try {
    vp = (JSON.parse(payload) as VpPayload).VP;
  } catch {
    return null;
  }
  if (!vp || vp.lat == null || vp.long == null) return null;
  return {
    id: `${parts[7]}/${parts[8]}`,
    mode,
    line: vp.desi ?? '',
    route: vp.route ?? parts[9] ?? '',
    dir: Number(vp.dir ?? parts[10] ?? 0),
    headsign: decodeURIComponent(parts[11] ?? ''),
    lat: vp.lat,
    lon: vp.long,
    speed: vp.spd ?? 0,
    heading: vp.hdg ?? 0,
    delay: vp.dl == null ? null : -vp.dl,
    tst: vp.tst ? Date.parse(vp.tst) : Date.now(),
  };
}

export type HfpStatus = 'connecting' | 'live' | 'offline';

export async function connectHfp(
  url: string,
  topics: string[],
  onUpdate: (u: VehicleUpdate) => void,
  onStatus: (s: HfpStatus) => void,
  signal: AbortSignal,
): Promise<MqttClient> {
  const { default: mqtt } = await import('mqtt');
  onStatus('connecting');
  const client = mqtt.connect(url, { reconnectPeriod: 5000, connectTimeout: 15000, clean: true });
  client.on('connect', () => {
    client.subscribe(topics, { qos: 0 });
    onStatus('live');
  });
  client.on('offline', () => onStatus('offline'));
  client.on('error', () => onStatus('offline'));
  client.on('message', (topic, buf) => {
    const u = parseVp(topic, buf.toString());
    if (u) onUpdate(u);
  });
  signal.addEventListener('abort', () => client.end(true), { once: true });
  return client;
}
