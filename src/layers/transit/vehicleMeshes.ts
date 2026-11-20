/** Instanced 3D vehicles per mode, with per-instance tint and line-number labels. */
import * as THREE from 'three';
import { MODE_COLORS, type TransitMode } from './transitData';
import type { Vehicle } from './vehicleStore';

const SIZE: Record<TransitMode, [number, number, number]> = {
  tram: [2.4, 3.6, 27], // width, height, length (m)
  bus: [2.55, 3.2, 12],
  ferry: [8, 5, 32],
};
const CAP: Record<TransitMode, number> = { tram: 160, bus: 260, ferry: 12 };

export type Tint = 'normal' | 'warn' | 'alert' | 'dim';
const TINT: Record<Tint, THREE.Color | null> = {
  normal: null,
  warn: new THREE.Color(0xf2a33a),
  alert: new THREE.Color(0xe5483b),
  dim: new THREE.Color(0x7d8a92),
};

function vehicleGeometry(mode: TransitMode): THREE.BufferGeometry {
  const [w, h, l] = SIZE[mode];
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(0, h / 2, 0);
  return g;
}

class LabelCache {
  private cache = new Map<string, THREE.SpriteMaterial>();
  get(text: string, color: number): THREE.SpriteMaterial {
    const key = `${text}|${color}`;
    let m = this.cache.get(key);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.roundRect(2, 2, 92, 44, 12);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text.slice(0, 5), 48, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false });
    this.cache.set(key, m);
    return m;
  }
  dispose(): void {
    this.cache.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
  }
}

export class VehicleMeshes {
  readonly group = new THREE.Group();
  private meshes = new Map<TransitMode, THREE.InstancedMesh>();
  private labels: THREE.Sprite[] = [];
  private labelCache = new LabelCache();
  private tmp = new THREE.Object3D();
  private color = new THREE.Color();
  showLabels = true;

  constructor(register: (m: THREE.Material) => void) {
    this.group.name = 'vehicles';
    for (const mode of Object.keys(SIZE) as TransitMode[]) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
      register(mat);
      const mesh = new THREE.InstancedMesh(vehicleGeometry(mode), mat, CAP[mode]);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(MODE_COLORS[mode]));
      this.meshes.set(mode, mesh);
      this.group.add(mesh);
    }
  }

  /** Write instances; `scale` exaggerates size when zoomed out. */
  sync(
    vehicles: Iterable<Vehicle>,
    ground: (x: number, z: number) => number,
    scale: number,
    tintOf: (v: Vehicle) => Tint,
  ): void {
    const counts: Record<TransitMode, number> = { tram: 0, bus: 0, ferry: 0 };
    let li = 0;
    for (const v of vehicles) {
      const mesh = this.meshes.get(v.mode);
      if (!mesh || counts[v.mode] >= CAP[v.mode]) continue;
      const i = counts[v.mode]++;
      const y = v.mode === 'ferry' ? 0 : ground(v.x, v.z);
      this.tmp.position.set(v.x, y + 0.05, v.z);
      this.tmp.rotation.set(0, -v.h, 0);
      this.tmp.scale.setScalar(scale);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      const tint = TINT[tintOf(v)];
      this.color.set(tint ?? MODE_COLORS[v.mode]);
      mesh.setColorAt(i, this.color);
      if (this.showLabels && v.line)
        li = this.placeLabel(li, v, y + SIZE[v.mode][1] * scale + 4 * scale, tint);
    }
    for (const [mode, mesh] of this.meshes) {
      mesh.count = counts[mode];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let k = li; k < this.labels.length; k++) this.labels[k].visible = false;
  }

  private placeLabel(i: number, v: Vehicle, y: number, tint: THREE.Color | null): number {
    let s = this.labels[i];
    if (!s) {
      s = new THREE.Sprite();
      s.renderOrder = 10;
      s.scale.set(0.045, 0.0225, 1);
      this.labels.push(s);
      this.group.add(s);
    }
    s.material = this.labelCache.get(v.line, tint ? tint.getHex() : MODE_COLORS[v.mode]);
    s.position.set(v.x, y, v.z);
    s.visible = true;
    return i + 1;
  }

  dispose(): void {
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    });
    this.labelCache.dispose();
    this.group.removeFromParent();
  }
}
