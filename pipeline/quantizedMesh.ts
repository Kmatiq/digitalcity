/** Minimal Cesium quantized-mesh-1.0 decoder (vertices + triangles only). */
export interface QmTile {
  minHeight: number;
  maxHeight: number;
  u: Float64Array; // 0..1 across tile (west -> east)
  v: Float64Array; // 0..1 across tile (south -> north)
  h: Float64Array; // meters
  indices: Uint32Array;
}

function zigzagDecode(arr: Uint16Array): Float64Array {
  const out = new Float64Array(arr.length);
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    acc += (v >> 1) ^ -(v & 1);
    out[i] = acc;
  }
  return out;
}

export function decodeQuantizedMesh(buf: ArrayBuffer): QmTile {
  const dv = new DataView(buf);
  const minHeight = dv.getFloat32(24, true);
  const maxHeight = dv.getFloat32(28, true);
  let off = 88;
  const n = dv.getUint32(off, true);
  off += 4;
  const read16 = (): Uint16Array => {
    const a = new Uint16Array(buf.slice(off, off + n * 2));
    off += n * 2;
    return a;
  };
  const u = zigzagDecode(read16());
  const v = zigzagDecode(read16());
  const hq = zigzagDecode(read16());
  const big = n > 65536;
  const isz = big ? 4 : 2;
  if (off % isz) off += isz - (off % isz);
  const triCount = dv.getUint32(off, true);
  off += 4;
  const raw = big
    ? new Uint32Array(buf.slice(off, off + triCount * 12))
    : new Uint16Array(buf.slice(off, off + triCount * 6));
  const indices = new Uint32Array(raw.length);
  let highest = 0;
  for (let i = 0; i < raw.length; i++) {
    const code = raw[i];
    indices[i] = highest - code;
    if (code === 0) highest++;
  }
  const s = 1 / 32767;
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    u[i] *= s;
    v[i] *= s;
    h[i] = minHeight + hq[i] * s * (maxHeight - minHeight);
  }
  return { minHeight, maxHeight, u, v, h, indices };
}
