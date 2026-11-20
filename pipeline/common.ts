import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createFrame } from '../src/core/coordinates';
import { getCity } from '../src/cities/cityConfig';

export const city = getCity(process.env.CITY ?? 'helsinki');
export const frame = createFrame(city.center.lat, city.center.lon);
export const halfW = city.size.width / 2;
export const halfD = city.size.depth / 2;

export function writePublic(rel: string, data: string | Uint8Array): void {
  const p = join('public', rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log(`wrote ${p} (${(data.length / 1024).toFixed(1)} KiB)`);
}

export async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
      if (r.ok) return r;
      if (r.status === 404) return r;
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}
