/**
 * Water surface at sea level from the official water-area polygons (pipeline output),
 * with animated ripples and environment reflections. Transparent => no depth write.
 */
import * as THREE from 'three';
import type { CityConfig } from '../../cities/cityConfig';
import type { CityContext, Layer, QualityLevel, SimTime } from '../../core/types';
import { createWaterNormalMap } from './waterNormals';

interface WaterFile {
  polygons: [number, number][][][];
}

export const WATER_COLOR = new THREE.Color(0x1f4f5f);

export class WaterLayer implements Layer {
  id = 'water';
  label = 'Vatten';
  category = 'surface' as const;
  attribution = ['Vattenområden: Helsingin kaupunki (CC BY 4.0)'];
  visible = true;

  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null = null;
  private normalMap = createWaterNormalMap();
  private elapsed = 0;

  constructor(private city: CityConfig) {}

  async load(ctx: CityContext, signal: AbortSignal): Promise<void> {
    const res = await fetch(ctx.resolveUrl(this.city.layers.water.file), { signal });
    if (!res.ok) throw new Error(`water HTTP ${res.status}`);
    const data = (await res.json()) as WaterFile;
    const shapes = data.polygons.map(([outer, ...holes]) => {
      // Shape space (x, y) = local (x, -z); rotated back to the XZ plane below.
      const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      s.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
      return s;
    });
    const geom = new THREE.ShapeGeometry(shapes);
    geom.rotateX(-Math.PI / 2);
    // world-scaled UVs for the ripple map (1 repeat per 90 m)
    const pos = geom.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 90;
      uv[i * 2 + 1] = pos.getZ(i) / 90;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geom.translate(0, ctx.seaLevel, 0);

    const mat = new THREE.MeshPhysicalMaterial({
      color: WATER_COLOR,
      roughness: 0.12,
      metalness: 0,
      ior: 1.333,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      envMapIntensity: 1.2,
    });
    ctx.registerMaterial(mat);
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.name = 'water';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    ctx.scene.add(this.mesh);
  }

  update(_t: SimTime, dt: number): void {
    this.elapsed += dt;
    this.normalMap.offset.set(this.elapsed * 0.012, this.elapsed * 0.007);
  }

  setQuality(q: QualityLevel): void {
    if (this.mesh) this.mesh.material.normalScale.setScalar(q === 'low' ? 0.15 : 0.25);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (this.mesh) this.mesh.visible = v;
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.mesh?.removeFromParent();
    this.normalMap.dispose();
  }
}
