/**
 * The diorama base: four cut walls from the ground/seabed down to minY with
 * schematic strata, a translucent water cutaway where the sea meets the edge, a
 * bottom face and a dark plinth that frames the model.
 */
import * as THREE from 'three';
import type { CityContext, Layer, QualityLevel, SimTime } from '../../core/types';
import { buildWalls } from './slabGeometry';

function grainTexture(size = 256): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  let seed = 7;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = Array.from({ length: size }, () => 0.9 + rnd() * 0.15);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const streak = rows[y] * 0.6 + rows[(y + 1) % size] * 0.4;
      const v = Math.min(1, streak * (0.85 + rnd() * 0.18));
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v * 255;
      d[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class SlabLayer implements Layer {
  id = 'slab';
  label = 'Sockel & geologi';
  category = 'base' as const;
  attribution: string[] = ['Jordlager: schematisk illustration'];
  isSchematic = true;
  visible = true;

  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  async load(ctx: CityContext): Promise<void> {
    const { halfWidth: hw, halfDepth: hd, minY } = ctx.bounds;
    const { solid, water } = buildWalls(ctx.heights, hw, hd, minY, ctx.seaLevel, 2);
    const grain = grainTexture();
    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      roughness: 0.95,
      metalness: 0,
    });
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2f86a3,
      emissive: 0x0d3a4a,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const walls = new THREE.Mesh(solid, wallMat);
    walls.receiveShadow = true;
    walls.name = 'slab-walls';
    const waterWall = new THREE.Mesh(water, waterMat);
    waterWall.renderOrder = 2;
    waterWall.name = 'slab-water';

    const bottom = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * hw, 2 * hd).rotateX(Math.PI / 2).translate(0, minY, 0),
      new THREE.MeshStandardMaterial({ color: 0x3b3633, roughness: 1 }),
    );
    const rim = 8;
    const plinthH = 6;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(2 * (hw + rim), plinthH, 2 * (hd + rim)).translate(
        0,
        minY - plinthH / 2,
        0,
      ),
      new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.55, metalness: 0.2 }),
    );
    plinth.receiveShadow = true;
    plinth.name = 'plinth';
    for (const m of [wallMat, waterMat, bottom.material, plinth.material]) {
      ctx.registerMaterial(m, { clip: false });
    }
    this.group.add(walls, waterWall, bottom, plinth);
    this.group.name = 'slab';
    ctx.scene.add(this.group);
    this.disposables.push(solid, water, grain, wallMat, waterMat, bottom.geometry, plinth.geometry);
    this.disposables.push(bottom.material, plinth.material);
  }

  update(_t: SimTime, _dt: number): void {}

  setQuality(_q: QualityLevel): void {}

  setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = v;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}
