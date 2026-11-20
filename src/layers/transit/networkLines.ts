/** Route network drawn as flat ribbons draped on the terrain (one mesh per tram route). */
import * as THREE from 'three';
import { MODE_COLORS, type Pt, type TransitNetwork, type TransitMode } from './transitData';

const WIDTH: Record<TransitMode, number> = { tram: 2.6, bus: 1.6, ferry: 3 };
const LIFT = 0.35;
const STEP = 8; // resample so the ribbon follows the terrain

function resample(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

function ribbon(
  lines: Pt[][],
  width: number,
  ground: (x: number, z: number) => number,
  flat: boolean,
): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const raw of lines) {
    const pts = resample(raw);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * (width / 2);
      const nz = ((bx - ax) / len) * (width / 2);
      const ya = flat ? 0.3 : ground(ax, az) + LIFT;
      const yb = flat ? 0.3 : ground(bx, bz) + LIFT;
      // two triangles, CCW from above
      pos.push(ax + nx, ya, az + nz, bx - nx, yb, bz - nz, ax - nx, ya, az - nz);
      pos.push(ax + nx, ya, az + nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class NetworkLines {
  readonly group = new THREE.Group();
  private routeMeshes = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  >();

  constructor(net: TransitNetwork, ground: (x: number, z: number) => number) {
    this.group.name = 'network';
    const modeOf = new Map(net.routes.map((r) => [r.id, r.mode]));
    const byRoute = new Map<string, Pt[][]>();
    for (const s of net.shapes) {
      const arr = byRoute.get(s.route) ?? [];
      arr.push(s.pts);
      byRoute.set(s.route, arr);
    }
    // buses merged into one mesh (context), trams/ferries per route (highlightable)
    const busLines: Pt[][] = [];
    for (const [route, lines] of byRoute) {
      const mode = modeOf.get(route)!;
      if (mode === 'bus') {
        busLines.push(...lines);
        continue;
      }
      const mesh = this.makeMesh(
        ribbon(lines, WIDTH[mode], ground, mode === 'ferry'),
        MODE_COLORS[mode],
        0.9,
      );
      mesh.renderOrder = mode === 'tram' ? 3 : 2;
      this.routeMeshes.set(route, mesh);
      this.group.add(mesh);
    }
    const bus = this.makeMesh(ribbon(busLines, WIDTH.bus, ground, false), MODE_COLORS.bus, 0.55);
    bus.renderOrder = 2;
    bus.name = 'bus-network';
    this.group.add(bus);
  }

  private makeMesh(
    g: THREE.BufferGeometry,
    color: number,
    opacity: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(g, m);
  }

  /** Highlight a set of route ids (e.g. affected by an incident); others fade. */
  highlight(routes: Map<string, number> | null): void {
    for (const [id, mesh] of this.routeMeshes) {
      const c = routes?.get(id);
      mesh.material.color.set(c ?? (routes ? 0x5d7a6e : MODE_COLORS.tram));
      mesh.material.opacity = c !== undefined ? 1 : routes ? 0.5 : 0.9;
      mesh.scale.y = 1;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.group.removeFromParent();
  }
}
