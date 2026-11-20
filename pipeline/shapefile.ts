/** Minimal ESRI Shapefile (.shp + .dbf) reader for PolyLineZ / PolygonZ records. */
import { readFileSync } from 'node:fs';

export interface ShapeRecord {
  bbox: [number, number, number, number]; // xmin, ymin, xmax, ymax
  parts: { x: number; y: number; z: number }[][];
  attrs: Record<string, string>;
}

function readDbf(path: string): { rows: number; get: (i: number) => Record<string, string> } {
  const d = readFileSync(path);
  const rows = d.readUInt32LE(4);
  const headerLen = d.readUInt16LE(8);
  const recLen = d.readUInt16LE(10);
  const fields: { name: string; len: number; off: number }[] = [];
  let off = 1;
  for (let i = 32; d[i] !== 0x0d; i += 32) {
    const name = d
      .subarray(i, i + 11)
      .toString('latin1')
      .replace(/\0.*$/, '');
    const len = d[i + 16];
    fields.push({ name, len, off });
    off += len;
  }
  const dec = new TextDecoder('utf-8');
  return {
    rows,
    get(i) {
      const base = headerLen + i * recLen;
      const out: Record<string, string> = {};
      for (const f of fields)
        out[f.name] = dec.decode(d.subarray(base + f.off, base + f.off + f.len)).trim();
      return out;
    },
  };
}

/** Iterate records whose bbox intersects `clip` (projected coordinates). */
export function* readShapes(
  basePath: string,
  clip: [number, number, number, number],
): Generator<ShapeRecord> {
  const shp = readFileSync(`${basePath}.shp`);
  const dbf = readDbf(`${basePath}.dbf`);
  let pos = 100;
  let idx = 0;
  while (pos < shp.length) {
    const len = shp.readInt32BE(pos + 4) * 2;
    const rec = pos + 8;
    pos = rec + len;
    const i = idx++;
    const type = shp.readInt32LE(rec);
    if (type !== 13 && type !== 15) continue; // PolyLineZ / PolygonZ
    const bbox: ShapeRecord['bbox'] = [
      shp.readDoubleLE(rec + 4),
      shp.readDoubleLE(rec + 12),
      shp.readDoubleLE(rec + 20),
      shp.readDoubleLE(rec + 28),
    ];
    if (bbox[2] < clip[0] || bbox[0] > clip[2] || bbox[3] < clip[1] || bbox[1] > clip[3]) continue;
    const nParts = shp.readInt32LE(rec + 36);
    const nPts = shp.readInt32LE(rec + 40);
    const partsOff = rec + 44;
    const ptsOff = partsOff + 4 * nParts;
    const zOff = ptsOff + 16 * nPts + 16;
    const starts = Array.from({ length: nParts }, (_, k) => shp.readInt32LE(partsOff + 4 * k));
    const parts = starts.map((s, k) => {
      const e = k + 1 < nParts ? starts[k + 1] : nPts;
      const pts = [];
      for (let p = s; p < e; p++) {
        pts.push({
          x: shp.readDoubleLE(ptsOff + 16 * p),
          y: shp.readDoubleLE(ptsOff + 16 * p + 8),
          z: shp.readDoubleLE(zOff + 8 * p),
        });
      }
      return pts;
    });
    yield { bbox, parts, attrs: dbf.get(i) };
  }
}
