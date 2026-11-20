/** WMS ortho imagery requests in the city's projected CRS (WMS 1.1.1 => x,y axis order). */
import * as THREE from 'three';

export interface ProjBbox {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

export function wmsUrl(
  base: string,
  layer: string,
  crs: string,
  b: ProjBbox,
  size: number,
): string {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    SRS: crs,
    BBOX: [b.minE, b.minN, b.maxE, b.maxN].map((v) => v.toFixed(2)).join(','),
    WIDTH: String(size),
    HEIGHT: String(size),
    FORMAT: 'image/jpeg',
  });
  return `${base}?${q}`;
}

/** Fetch an image as a GPU-ready texture (flipped so v=0 is the south edge). */
export async function fetchTexture(
  url: string,
  signal: AbortSignal,
  anisotropy: number,
): Promise<THREE.Texture> {
  const res = await fetch(url, { signal, mode: 'cors' });
  if (!res.ok) throw new Error(`WMS HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`WMS returned ${type}`);
  const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bmp);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  tex.addEventListener('dispose', () => bmp.close());
  return tex;
}
