/** Minimal streaming CSV reader (RFC 4180 quotes) for large GTFS files. */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Calls `onRow` with a header-keyed accessor for each row. */
export async function readCsv(
  path: string,
  onRow: (get: (col: string) => string) => void,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let row: string[] = [];
  const get = (col: string): string => row[header!.get(col) ?? -1] ?? '';
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!header) {
      header = new Map(parseCsvLine(line).map((h, i) => [h.trim(), i]));
      continue;
    }
    if (!line) continue;
    row = parseCsvLine(line);
    onRow(get);
  }
}
