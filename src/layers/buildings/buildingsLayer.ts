/**
 * LOD2 buildings streamed as 3D Tiles 1.1 (glTF + Draco + EXT_mesh_features /
 * EXT_structural_metadata) from kartta.hel.fi. The tileset (ECEF) is mapped into the
 * local frame with one matrix; only tiles inside the slab box are loaded.
 */
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, LoadRegionPlugin, OBBRegion } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { CityConfig } from '../../cities/cityConfig';
import { createFrame, ecefToLocalMatrix } from '../../core/coordinates';
import { QUALITY } from '../../core/quality';
import type { CityContext, Layer, PickResult, QualityLevel, SimTime } from '../../core/types';
import { createBuildingMaterial } from './buildingMaterial';
import { colorizeMesh, neutralColors, readFeatureProps } from './featureData';
import { addressLabel, constructionYear, num, str, usageLabel } from './buildingStyle';

/** Product of local matrices from `root` (exclusive) down to `o` (inclusive). */
function nodeChain(o: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) {
    n.updateMatrix();
    m.premultiply(n.matrix);
  }
  return m;
}

export class BuildingsLayer implements Layer {
  id = 'buildings';
  label = 'Byggnader (LOD2)';
  category = 'surface' as const;
  attribution: string[];
  visible = true;

  private tiles: TilesRenderer | null = null;
  private region: OBBRegion | null = null;
  private material = createBuildingMaterial();
  private draco = new DRACOLoader();
  private ctx!: CityContext;
  private quality: QualityLevel = 'medium';
  private errors = 0;

  constructor(private city: CityConfig) {
    this.attribution = [city.layers.buildings.attribution];
  }

  async load(ctx: CityContext, signal: AbortSignal): Promise<void> {
    this.ctx = ctx;
    ctx.registerMaterial(this.material);
    this.draco.setDecoderPath(ctx.resolveUrl('draco/'));

    const tiles = new TilesRenderer(this.city.layers.buildings.url);
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco, metadata: true }));
    const frame = createFrame(this.city.center.lat, this.city.center.lon);
    const toLocal = new THREE.Matrix4().fromArray(ecefToLocalMatrix(frame));
    const regions = new LoadRegionPlugin();
    tiles.registerPlugin(regions);
    this.region = this.makeRegion(toLocal);
    regions.addRegion(this.region);

    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(toLocal);
    tiles.group.updateMatrixWorld(true);
    tiles.group.name = 'buildings';
    tiles.fetchOptions = { mode: 'cors' };
    tiles.setCamera(ctx.camera);
    tiles.setResolutionFromRenderer(ctx.camera, ctx.renderer);
    tiles.addEventListener('load-model', ({ scene }) => this.onModel(scene));
    tiles.addEventListener('load-error', ({ error, url }) => {
      if (this.errors++ < 3) console.warn('[buildings] tile failed', String(url), error);
    });
    this.tiles = tiles;
    this.setQuality(this.quality);
    ctx.scene.add(tiles.group);
    signal.addEventListener('abort', () => this.dispose(), { once: true });

    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      tiles.addEventListener('load-tileset', done);
      tiles.addEventListener('load-error', done);
      setTimeout(done, 15000);
    });
  }

  /** Mask region = slab box expressed in the tileset's ECEF frame. */
  private makeRegion(toLocal: THREE.Matrix4): OBBRegion {
    const b = this.ctx.bounds;
    const region = new OBBRegion({
      mask: true,
      errorTarget: QUALITY[this.quality].tilesErrorTarget,
    });
    region.obb.box.min.set(-b.halfWidth, b.minY, -b.halfDepth);
    region.obb.box.max.set(b.halfWidth, b.maxY, b.halfDepth);
    region.obb.transform.copy(toLocal).invert();
    region.obb.update();
    return region;
  }

  private onModel(scene: THREE.Object3D): void {
    scene.updateMatrix();
    // ECEF->local x tile transform; independent of whether the scene is parented yet
    const sceneToLocal = new THREE.Matrix4().multiplyMatrices(
      this.tiles!.group.matrix,
      scene.matrix,
    );
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as THREE.Material;
      try {
        colorizeMesh(mesh, nodeChain(mesh, scene).premultiply(sceneToLocal));
      } catch (e) {
        // never leave a mesh on its original (unclipped) material
        if (this.errors++ < 3) console.warn('[buildings] metadata colouring failed', e);
        mesh.geometry.deleteAttribute('color');
        mesh.geometry.setAttribute('color', neutralColors(mesh.geometry));
      }
      mesh.material = this.material;
      old.dispose();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }

  pick(raycaster: THREE.Raycaster): (PickResult & { distance: number }) | null {
    if (!this.tiles) return null;
    const hits = raycaster.intersectObject(this.tiles.group, true);
    const b = this.ctx.bounds;
    for (const hit of hits) {
      const p = hit.point;
      if (Math.abs(p.x) > b.halfWidth || Math.abs(p.z) > b.halfDepth) continue; // clipped away
      const props = readFeatureProps(hit);
      if (!props) continue;
      const year = constructionYear(props);
      const storeys = num(props, 'storeysAboveGround');
      const height = num(props, 'height');
      return {
        layerId: this.id,
        distance: hit.distance,
        title: addressLabel(props) ?? usageLabel(props) ?? 'Byggnad',
        properties: {
          Användning: usageLabel(props),
          Byggår: year,
          Våningar: storeys,
          Höjd: height !== null ? `${height.toFixed(1)} m` : null,
          Id: str(props, 'VTJ_PRT') ?? str(props, 'id'),
        },
      };
    }
    return null;
  }

  pending(): number {
    // `stats` exists at runtime but is missing from the published typings
    const s = (this.tiles as unknown as { stats?: Record<string, number> } | null)?.stats;
    return s ? (s.queued ?? 0) + (s.downloading ?? 0) + (s.parsing ?? 0) : 0;
  }

  update(_t: SimTime, _dt: number): void {
    if (!this.tiles) return;
    this.ctx.camera.updateMatrixWorld();
    this.tiles.setResolutionFromRenderer(this.ctx.camera, this.ctx.renderer);
    this.tiles.update();
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    const err = QUALITY[q].tilesErrorTarget;
    if (this.tiles) this.tiles.errorTarget = err;
    if (this.region) this.region.errorTarget = err;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (this.tiles) this.tiles.group.visible = v;
  }

  dispose(): void {
    this.tiles?.dispose();
    this.tiles?.group.removeFromParent();
    this.tiles = null;
    this.material.dispose();
    this.draco.dispose();
  }
}
