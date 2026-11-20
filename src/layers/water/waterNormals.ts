/** Procedural, tileable ripple normal map from periodic value-noise fBm. */
import * as THREE from 'three';

function makeNoise(period: number, seed: number): (x: number, y: number) => number {
  const grid = new Float32Array(period * period);
  let s = seed;
  for (let i = 0; i < grid.length; i++) {
    s = (s * 16807) % 2147483647;
    grid[i] = s / 2147483647;
  }
  const at = (x: number, y: number): number =>
    grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const fade = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = fade(x - xi);
    const fy = fade(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
}

export function createWaterNormalMap(size = 512): THREE.DataTexture {
  const octaves = [
    { period: 8, amp: 1.0, n: makeNoise(8, 11) },
    { period: 16, amp: 0.5, n: makeNoise(16, 23) },
    { period: 32, amp: 0.25, n: makeNoise(32, 37) },
    { period: 64, amp: 0.12, n: makeNoise(64, 51) },
  ];
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) v += o.amp * o.n((x / size) * o.period, (y / size) * o.period);
      h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const k = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const u = h[((y + 1) % size) * size + x];
      const nx = (l - r) * k;
      const ny = (d - u) * k;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
