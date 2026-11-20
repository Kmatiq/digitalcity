/**
 * Terrain + 5 cm ortho imagery. The slab is split into square tiles; each starts
 * with a shared low-res overview image and upgrades its own WMS texture by camera
 * distance through the shared priority queue (nearest first).
 */
import * as THREE from 'three';
import type { CityConfig } from '../../cities/cityConfig';
import { createFrame, localToProjected } from '../../core/coordinates';
import { isAbort } from '../../core/fetchQueue';
import { QUALITY } from '../../core/quality';
import type { CityContext, Layer, QualityLevel, SimTime } from '../../core/types';
import { bboxOf, buildTileGeometry, fitAffine, type Affine } from './groundTile';
import { fetchTexture, wmsUrl, type ProjBbox } from './orthoSource';

const TILE = 250;
const LOD_INTERVAL = 0.3; // s

interface Tile {
  x0: number;
  z0: number;
  center: THREE.Vector3;
  affine: Affine;
  bbox: ProjBbox;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  size: number; // loaded texture size (0 = overview)
  wanted: number;
  pending: AbortController | null;
}

export class TerrainLayer implements Layer {
  id = 'terrain';
  label = 'Mark & flygfoto';
  category = 'base' as const;
  attribution: string[];
  visible = true;

  private group = new THREE.Group();
  private tiles: Tile[] = [];
  private overview: { tex: THREE.Texture; bbox: ProjBbox } | null = null;
  private ctx!: CityContext;
  private quality: QualityLevel = 'medium';
  private sinceLod = 0;
  private builtSpacing = 0;
  private signal!: AbortSignal;
  private failures = 0;

  constructor(private city: CityConfig) {
    this.group.name = 'terrain';
    this.attribution = [city.layers.ortho.attribution, city.layers.terrain.attribution];
  }

  async load(ctx: CityContext, signal: AbortSignal): Promise<void> {
    this.ctx = ctx;
    this.signal = signal;
    const frame = createFrame(this.city.center.lat, this.city.center.lon);
    const crs = this.city.layers.ortho.crs;
    const project = (x: number, z: number): [number, number] => localToProjected(frame, crs, x, z);
    const { halfWidth: hw, halfDepth: hd } = ctx.bounds;
    for (let z0 = -hd; z0 < hd - 1e-6; z0 += TILE) {
      for (let x0 = -hw; x0 < hw - 1e-6; x0 += TILE) {
        const affine = fitAffine(x0, z0, TILE, project);
        const bbox = bboxOf(affine, TILE);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x8a8f80,
          roughness: 0.92,
          metalness: 0,
        });
        ctx.registerMaterial(mat);
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        mesh.receiveShadow = true;
        mesh.name = `ground ${x0},${z0}`;
        const center = new THREE.Vector3(
          x0 + TILE / 2,
          ctx.groundHeight(x0 + TILE / 2, z0 + TILE / 2),
          z0 + TILE / 2,
        );
        this.tiles.push({ x0, z0, center, affine, bbox, mesh, size: 0, wanted: 0, pending: null });
        this.group.add(mesh);
      }
    }
    this.rebuildGeometry();
    ctx.scene.add(this.group);
    await this.loadOverview(project);
  }

  private rebuildGeometry(): void {
    const spacing = QUALITY[this.quality].groundSpacing;
    if (spacing === this.builtSpacing || !this.ctx) return;
    this.builtSpacing = spacing;
    for (const t of this.tiles) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = buildTileGeometry(
        this.ctx.heights,
        t.x0,
        t.z0,
        TILE,
        spacing,
        t.affine,
        t.bbox,
      );
    }
  }

  private async loadOverview(project: (x: number, z: number) => [number, number]): Promise<void> {
    const { halfWidth: hw, halfDepth: hd } = this.ctx.bounds;
    const a = fitAffine(-hw, -hd, 2 * hw, project);
    const bbox = bboxOf(a, 2 * hw, 2);
    const size = this.quality === 'low' ? 1024 : 2048;
    const o = this.city.layers.ortho;
    const url = wmsUrl(o.url, o.layer, o.crs, bbox, size);
    const tex = await this.ctx.queue.add({
      priority: () => -1,
      signal: this.signal,
      run: (s) => fetchTexture(url, s, 4),
    });
    this.overview = { tex, bbox };
    for (const t of this.tiles) if (t.size === 0) this.applyOverview(t);
  }

  private applyOverview(t: Tile): void {
    if (!this.overview) return;
    const o = this.overview.bbox;
    const tex = this.overview.tex.clone(); // shares the uploaded image
    const ow = o.maxE - o.minE;
    const oh = o.maxN - o.minN;
    tex.repeat.set((t.bbox.maxE - t.bbox.minE) / ow, (t.bbox.maxN - t.bbox.minN) / oh);
    tex.offset.set((t.bbox.minE - o.minE) / ow, (t.bbox.minN - o.minN) / oh);
    tex.needsUpdate = true;
    this.setMap(t, tex);
  }

  private setMap(t: Tile, tex: THREE.Texture): void {
    const m = t.mesh.material;
    m.map?.dispose();
    m.map = tex;
    m.color.set(0xffffff);
    m.needsUpdate = true;
  }

  private wantedSize(t: Tile): number {
    const max = QUALITY[this.quality].orthoMaxSize;
    const d = this.ctx.camera.position.distanceTo(t.center);
    const lod = d < 350 ? 1 : d < 800 ? 2 : d < 1600 ? 4 : 8;
    const size = max / lod;
    return size < 512 ? 0 : size; // far away: overview is enough
  }

  private updateLod(): void {
    for (const t of this.tiles) {
      t.wanted = this.wantedSize(t);
      const tooLow = t.wanted > t.size;
      const tooHigh = t.size > 0 && t.size >= t.wanted * 4;
      if ((tooLow || tooHigh) && !t.pending) this.request(t, t.wanted);
    }
  }

  private request(t: Tile, size: number): void {
    if (size === 0) {
      t.size = 0;
      this.applyOverview(t);
      return;
    }
    const ctl = new AbortController();
    this.signal.addEventListener('abort', () => ctl.abort(), { once: true });
    t.pending = ctl;
    const o = this.city.layers.ortho;
    const url = wmsUrl(o.url, o.layer, o.crs, t.bbox, size);
    const aniso = this.ctx.renderer.capabilities.getMaxAnisotropy();
    this.ctx.queue
      .add({
        priority: () => this.ctx.camera.position.distanceTo(t.center) - size / 100,
        signal: ctl.signal,
        run: (s) => fetchTexture(url, s, aniso),
      })
      .then((tex) => {
        t.size = size;
        this.setMap(t, tex);
      })
      .catch((e) => {
        if (!isAbort(e) && this.failures++ < 3) console.warn('[terrain] ortho tile failed', e);
      })
      .finally(() => {
        t.pending = null;
      });
  }

  update(_t: SimTime, dt: number): void {
    this.sinceLod += dt;
    if (this.sinceLod < LOD_INTERVAL || !this.overview) return;
    this.sinceLod = 0;
    this.updateLod();
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.rebuildGeometry();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = v;
  }

  dispose(): void {
    for (const t of this.tiles) {
      t.pending?.abort();
      t.mesh.geometry.dispose();
      t.mesh.material.map?.dispose();
      t.mesh.material.dispose();
    }
    this.overview?.tex.dispose();
    this.group.removeFromParent();
  }
}
