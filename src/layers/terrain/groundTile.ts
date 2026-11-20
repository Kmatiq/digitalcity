/** One square ground tile: height-sampled grid with UVs mapped to an projected bbox. */
import * as THREE from 'three';
import type { HeightField } from '../../core/heightfield';
import type { ProjBbox } from './orthoSource';

/** Affine local(x,z) -> EPSG:3879(E,N), fitted from three tile corners. */
export interface Affine {
  e0: number;
  n0: number;
  ex: number;
  ez: number;
  nx: number;
  nz: number;
}

export function fitAffine(
  x0: number,
  z0: number,
  size: number,
  project: (x: number, z: number) => [number, number],
): Affine {
  const [e0, n0] = project(x0, z0);
  const [e1, n1] = project(x0 + size, z0);
  const [e2, n2] = project(x0, z0 + size);
  return {
    e0,
    n0,
    ex: (e1 - e0) / size,
    nx: (n1 - n0) / size,
    ez: (e2 - e0) / size,
    nz: (n2 - n0) / size,
  };
}

export function bboxOf(a: Affine, size: number, pad = 0.5): ProjBbox {
  const es: number[] = [];
  const ns: number[] = [];
  for (const [dx, dz] of [
    [0, 0],
    [size, 0],
    [0, size],
    [size, size],
  ]) {
    es.push(a.e0 + a.ex * dx + a.ez * dz);
    ns.push(a.n0 + a.nx * dx + a.nz * dz);
  }
  return {
    minE: Math.min(...es) - pad,
    minN: Math.min(...ns) - pad,
    maxE: Math.max(...es) + pad,
    maxN: Math.max(...ns) + pad,
  };
}

export function buildTileGeometry(
  heights: HeightField,
  x0: number,
  z0: number,
  size: number,
  spacing: number,
  affine: Affine,
  bbox: ProjBbox,
): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(size / spacing)) + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const w = bbox.maxE - bbox.minE;
  const h = bbox.maxN - bbox.minN;
  for (let j = 0; j < n; j++) {
    const dz = (j / (n - 1)) * size;
    for (let i = 0; i < n; i++) {
      const dx = (i / (n - 1)) * size;
      const k = j * n + i;
      pos[k * 3] = x0 + dx;
      pos[k * 3 + 1] = heights.sample(x0 + dx, z0 + dz);
      pos[k * 3 + 2] = z0 + dz;
      const e = affine.e0 + affine.ex * dx + affine.ez * dz;
      const nn = affine.n0 + affine.nx * dx + affine.nz * dz;
      uv[k * 2] = (e - bbox.minE) / w;
      uv[k * 2 + 1] = (nn - bbox.minN) / h;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // CCW seen from above (+Y): a(nw) -> c(sw) -> b(ne)
      idx.set([a, c, b, b, c, d], p);
      p += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
