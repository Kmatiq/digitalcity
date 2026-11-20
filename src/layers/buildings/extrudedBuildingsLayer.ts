/**
 * Buildings extruded from pipeline footprints (Göteborg: roof contours with eave heights
 * from the city's base map). Same material/section look as the 3D Tiles buildings.
 */
import * as THREE from 'three';
import type { CityConfig } from '../../cities/cityConfig';
import type { CityContext, Layer, PickResult, QualityLevel, SimTime } from '../../core/types';
import { createBuildingMaterial } from './buildingMaterial';
import {
  buildExtrudedGeometry,
  roofHeight,
  type BuildingPalette,
  type ExtrudedBuilding,
} from './extrudeGeometry';

const STOREY_M = 3.2;

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const C = (hex: number): THREE.Color => new THREE.Color(hex);
// Göteborg stone town: brick, ochre, sand, pale plaster; roofs black sheet, red tile, copper
const WALLS = [
  C(0xa95f45),
  C(0xc98f5c),
  C(0xd5bf96),
  C(0xb7a48a),
  C(0x9b5a48),
  C(0xd9cdb4),
  C(0xbfb3a1),
];
const ROOFS = [
  C(0x33383b),
  C(0x2a2e31),
  C(0x8c4a35),
  C(0x3d4446),
  C(0x7a3f30),
  C(0x45494b),
  C(0x9a4f38),
  C(0x5d7f6e),
];

const palette: BuildingPalette = {
  wall: (b) =>
    WALLS[Math.floor(hash01(b.id) * WALLS.length)]
      .clone()
      .multiplyScalar(0.9 + hash01(b.id + 7) * 0.15),
  roof: (b) => ROOFS[Math.floor(hash01(b.id * 3.1) * ROOFS.length)],
};

export class ExtrudedBuildingsLayer implements Layer {
  id = 'buildings';
  label = 'Byggnader (LOD1,5)';
  category = 'surface' as const;
  attribution: string[];
  visible = true;

  private mesh: THREE.Mesh | null = null;
  private buildings: ExtrudedBuilding[] = [];
  private material = createBuildingMaterial();

  constructor(private city: CityConfig) {
    this.attribution = [city.layers.buildings.attribution];
  }

  async load(ctx: CityContext, signal: AbortSignal): Promise<void> {
    const file = this.city.layers.buildings.file;
    if (!file) throw new Error('extruded buildings need layers.buildings.file');
    const res = await fetch(ctx.resolveUrl(file), { signal });
    if (!res.ok) throw new Error(`buildings HTTP ${res.status}`);
    this.buildings = ((await res.json()) as { buildings: ExtrudedBuilding[] }).buildings;
    ctx.registerMaterial(this.material);
    this.mesh = new THREE.Mesh(buildExtrudedGeometry(this.buildings, palette), this.material);
    this.mesh.name = 'buildings';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    ctx.scene.add(this.mesh);
  }

  pick(raycaster: THREE.Raycaster): (PickResult & { distance: number }) | null {
    if (!this.mesh) return null;
    const hit = raycaster.intersectObject(this.mesh, false)[0];
    if (!hit || hit.face == null) return null;
    const bid = this.mesh.geometry.getAttribute('bid').getX(hit.face.a);
    const b = this.buildings[Math.round(bid)];
    if (!b) return null;
    const top = roofHeight(b);
    const h = top - b.base;
    return {
      layerId: this.id,
      distance: hit.distance,
      title: 'Byggnad',
      properties: {
        Höjd: `${h.toFixed(1)} m`,
        'Våningar (uppsk.)': Math.max(1, Math.round(h / STOREY_M)),
        Takfot: `${top.toFixed(1)} m (${this.city.heightSystem})`,
        Mark: `${b.base.toFixed(1)} m`,
        Källa: 'Baskarta, takkonturer',
      },
    };
  }

  update(_t: SimTime, _dt: number): void {}

  setQuality(_q: QualityLevel): void {}

  setVisible(v: boolean): void {
    this.visible = v;
    if (this.mesh) this.mesh.visible = v;
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.mesh?.removeFromParent();
  }
}
