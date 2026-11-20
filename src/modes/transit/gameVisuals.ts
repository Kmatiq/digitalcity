/** 3D overlays for Trafikledare: incident beacons, draft/provisional lines, shuttle buses. */
import * as THREE from 'three';
import { pointAt, polylineLength, type Pt } from '../../layers/transit/transitData';
import type { Incident, ProvisionalLine } from './gameLogic';
import { KINDS } from './gameLogic';

const RED = new THREE.Color(0xe5483b);
const AMBER = new THREE.Color(0xf2c23a);
const GREEN = new THREE.Color(0x3fbf6f);
const LINE_COLOR = 0xff8a1f;
const SHUTTLE_SPEED = 9; // m/s

interface Marker {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  progress: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface Shuttle {
  line: ProvisionalLine;
  length: number;
  meshes: THREE.Mesh[];
}

export class GameVisuals {
  readonly group = new THREE.Group();
  private markers = new Map<number, Marker>();
  private shuttles: Shuttle[] = [];
  private draft: THREE.Group | null = null;
  private time = 0;
  private shuttleGeo = new THREE.BoxGeometry(2.5, 3.2, 12).translate(0, 1.6, 0);
  private shuttleMat: THREE.MeshStandardMaterial;

  constructor(
    private ground: (x: number, z: number) => number,
    register: (m: THREE.Material) => void,
  ) {
    this.group.name = 'transit-game';
    this.shuttleMat = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.5 });
    register(this.shuttleMat);
  }

  private makeMarker(i: Incident): Marker {
    const group = new THREE.Group();
    const y = this.ground(i.x, i.z) + 0.6;
    group.position.set(i.x, y, i.z);
    const flat = (m: THREE.Mesh): void => {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 6;
    };
    const basic = (color: THREE.Color, opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 20, 48), basic(RED, 0.9));
    flat(ring);
    const progress = new THREE.Mesh(
      new THREE.RingGeometry(22, 27, 48, 1, 0, 0.001),
      basic(AMBER, 0.95),
    );
    flat(progress);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 120, 12, 1, true),
      basic(RED, 0.35),
    );
    beam.position.y = 60;
    beam.renderOrder = 6;
    group.add(ring, progress, beam);
    this.group.add(group);
    return { group, ring, beam, progress };
  }

  sync(incidents: Incident[], scale: number): void {
    const seen = new Set<number>();
    for (const i of incidents) {
      seen.add(i.id);
      let m = this.markers.get(i.id);
      if (!m) {
        m = this.makeMarker(i);
        this.markers.set(i.id, m);
      }
      const color = i.status === 'resolved' ? GREEN : i.status === 'repairing' ? AMBER : RED;
      m.ring.material.color.copy(color);
      m.beam.material.color.copy(color);
      const pulse = i.status === 'active' ? 1 + 0.15 * Math.sin(this.time * 5) : 1;
      m.group.scale.setScalar(scale * pulse);
      if (i.status === 'repairing') {
        const done = 1 - i.repairLeft / KINDS[i.kind].repair;
        m.progress.geometry.dispose();
        m.progress.geometry = new THREE.RingGeometry(
          22,
          27,
          48,
          1,
          Math.PI / 2,
          -Math.max(0.001, done * Math.PI * 2),
        );
        m.progress.visible = true;
      } else m.progress.visible = false;
    }
    for (const [id, m] of this.markers) {
      if (seen.has(id)) continue;
      this.disposeObject(m.group);
      this.markers.delete(id);
    }
  }

  /** Screen-space hit test against incident markers (touch friendly). */
  hitIncident(
    incidents: Incident[],
    camera: THREE.Camera,
    ndc: THREE.Vector2,
    aspect: number,
  ): Incident | null {
    let best: Incident | null = null;
    let bestD = 0.09; // ~5% of screen height
    const v = new THREE.Vector3();
    for (const i of incidents) {
      if (i.status === 'resolved') continue;
      for (const h of [0, 30, 60]) {
        v.set(i.x, this.ground(i.x, i.z) + h, i.z).project(camera);
        if (v.z > 1) continue;
        const d = Math.hypot((v.x - ndc.x) * aspect, v.y - ndc.y);
        if (d < bestD) [bestD, best] = [d, i];
      }
    }
    return best;
  }

  private ribbon(pts: Pt[], width: number, color: number, opacity: number): THREE.Mesh {
    const pos: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const steps = Math.max(1, Math.ceil(len / 8));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const [x0, z0] = [ax + (bx - ax) * t0, az + (bz - az) * t0];
        const [x1, z1] = [ax + (bx - ax) * t1, az + (bz - az) * t1];
        const nx = (-(bz - az) / len) * (width / 2);
        const nz = ((bx - ax) / len) * (width / 2);
        const y0 = this.ground(x0, z0) + 0.6;
        const y1 = this.ground(x1, z1) + 0.6;
        pos.push(x0 + nx, y0, z0 + nz, x1 - nx, y1, z1 - nz, x0 - nx, y0, z0 - nz);
        pos.push(x0 + nx, y0, z0 + nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 5;
    return mesh;
  }

  /** Draft line while the player taps stops. */
  setDraft(pts: Pt[]): void {
    if (this.draft) this.disposeObject(this.draft);
    this.draft = null;
    if (!pts.length) return;
    const g = new THREE.Group();
    if (pts.length > 1) g.add(this.ribbon(pts, 5, LINE_COLOR, 0.6));
    for (const [x, z] of pts) {
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 5, 2, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true }),
      );
      dot.position.set(x, this.ground(x, z) + 1.2, z);
      dot.renderOrder = 7;
      g.add(dot);
    }
    this.draft = g;
    this.group.add(g);
  }

  addLine(line: ProvisionalLine): void {
    this.group.add(this.ribbon(line.pts, 4, LINE_COLOR, 0.9));
    const meshes = [0, 1].map(() => {
      const m = new THREE.Mesh(this.shuttleGeo, this.shuttleMat);
      m.castShadow = true;
      this.group.add(m);
      return m;
    });
    this.shuttles.push({ line, length: polylineLength(line.pts), meshes });
  }

  update(dt: number, scale: number): void {
    this.time += dt;
    for (const s of this.shuttles) {
      s.meshes.forEach((m, k) => {
        // ping-pong along the line, the two buses half a cycle apart
        const cycle = (2 * s.length) / SHUTTLE_SPEED;
        const t = ((this.time / cycle + k * 0.5) % 1) * 2 * s.length;
        const back = t > s.length;
        const { p, dir } = pointAt(s.line.pts, back ? 2 * s.length - t : t);
        const sign = back ? -1 : 1;
        m.position.set(p[0], this.ground(p[0], p[1]) + 0.1, p[1]);
        m.rotation.y = Math.atan2(-dir[0] * sign, -dir[1] * sign);
        m.scale.setScalar(scale);
      });
    }
  }

  private disposeObject(o: THREE.Object3D): void {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.geometry === this.shuttleGeo) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    o.removeFromParent();
  }

  dispose(): void {
    this.disposeObject(this.group);
    this.shuttleGeo.dispose();
    this.shuttleMat.dispose();
    this.markers.clear();
    this.shuttles = [];
  }
}
