/** Height grid produced by pipeline/build-terrain.ts (Int16 cm, row 0 = north). */
export interface TerrainMeta {
  resolution: number;
  nx: number;
  nz: number;
  minY: number;
  maxY: number;
  seabed: { schematic: boolean; maxDepth: number };
}

export class HeightField {
  constructor(
    readonly meta: TerrainMeta,
    readonly data: Float32Array,
    readonly halfW: number,
    readonly halfD: number,
  ) {}

  static async load(
    binUrl: string,
    metaUrl: string,
    halfW: number,
    halfD: number,
    signal?: AbortSignal,
  ): Promise<HeightField> {
    const [metaRes, binRes] = await Promise.all([
      fetch(metaUrl, { signal }),
      fetch(binUrl, { signal }),
    ]);
    if (!metaRes.ok || !binRes.ok)
      throw new Error(`heightfield HTTP ${metaRes.status}/${binRes.status}`);
    const meta = (await metaRes.json()) as TerrainMeta;
    const raw = new Int16Array(await binRes.arrayBuffer());
    const data = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw[i] / 100;
    return new HeightField(meta, data, halfW, halfD);
  }

  /** Bilinear height at local x/z (clamped to the grid). */
  sample(x: number, z: number): number {
    const { resolution: r, nx, nz } = this.meta;
    const gx = Math.min(nx - 1.0001, Math.max(0, (x + this.halfW) / r));
    const gz = Math.min(nz - 1.0001, Math.max(0, (z + this.halfD) / r));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const i = z0 * nx + x0;
    const d = this.data;
    const top = d[i] * (1 - fx) + d[i + 1] * fx;
    const bot = d[i + nx] * (1 - fx) + d[i + nx + 1] * fx;
    return top * (1 - fz) + bot * fz;
  }
}
