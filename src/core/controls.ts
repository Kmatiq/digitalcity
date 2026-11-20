/**
 * Diorama camera controls (orbit around a ground target).
 * Touch: 1 finger = orbit, 2-finger pinch = zoom, 2-finger drag = pan,
 *        2-finger vertical drag with fingers side by side = pitch, twist = rotate.
 * Mouse: left = orbit, right / shift+left = pan, ctrl+left = pitch, wheel = zoom.
 * A short press without movement emits `onTap` (never fires after a drag).
 */
import * as THREE from 'three';

const TAP_MAX_MS = 350;
const TAP_MAX_PX = 8;
const GESTURE_LOCK_PX = 12;
const MIN_POLAR = 0.05;
const MAX_POLAR = 1.48;

interface Pt {
  x: number;
  y: number;
}
type TwoMode = 'undecided' | 'panzoom' | 'pitch';

export class DioramaControls {
  readonly target = new THREE.Vector3();
  distance = 2500;
  azimuth = 0.6; // radians around +Y; 0 = camera south of target
  polar = 0.9; // radians from vertical
  minDistance = 25;
  maxDistance = 7000;
  limit = 1300; // |target.x|, |target.z| clamp
  enabled = true;
  autoRotate = 0; // rad/s
  onTap: ((e: PointerEvent) => void) | null = null;
  onInteract: (() => void) | null = null;

  private goal = { target: new THREE.Vector3(), distance: 2500, azimuth: 0.6, polar: 0.9 };
  private pointers = new Map<number, Pt>();
  private down: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  private twoMode: TwoMode = 'undecided';
  private twoStart: { a: Pt; b: Pt } | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContext);
  }

  set(position: THREE.Vector3, target: THREE.Vector3, immediate = true): void {
    const off = position.clone().sub(target);
    const d = Math.max(1, off.length());
    this.goal.target.copy(target);
    this.goal.distance = d;
    this.goal.polar = THREE.MathUtils.clamp(Math.acos(off.y / d), MIN_POLAR, MAX_POLAR);
    this.goal.azimuth = Math.atan2(off.x, off.z);
    if (immediate) this.snap();
  }

  snap(): void {
    this.target.copy(this.goal.target);
    this.distance = this.goal.distance;
    this.azimuth = this.goal.azimuth;
    this.polar = this.goal.polar;
    this.apply();
  }

  update(dt: number): void {
    if (this.autoRotate) this.goal.azimuth += this.autoRotate * dt;
    const k = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goal.target, k);
    this.distance += (this.goal.distance - this.distance) * k;
    this.azimuth += (this.goal.azimuth - this.azimuth) * k;
    this.polar += (this.goal.polar - this.polar) * k;
    this.apply();
  }

  private apply(): void {
    const s = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * s * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * s * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    // quantised so shadow cascades are not rebuilt every frame while zooming
    const near = 2 ** Math.round(Math.log2(THREE.MathUtils.clamp(this.distance / 400, 0.5, 16)));
    const far = this.distance > 2000 ? 40000 : 12000;
    if (near !== this.camera.near || far !== this.camera.far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  // --- gesture primitives -------------------------------------------------

  private orbit(dx: number, dy: number): void {
    const h = this.el.clientHeight || 1;
    this.goal.azimuth -= (dx / h) * Math.PI * 1.2;
    this.goal.polar = THREE.MathUtils.clamp(
      this.goal.polar - (dy / h) * Math.PI * 0.8,
      MIN_POLAR,
      MAX_POLAR,
    );
  }

  private pitch(dy: number): void {
    const h = this.el.clientHeight || 1;
    this.goal.polar = THREE.MathUtils.clamp(
      this.goal.polar - (dy / h) * Math.PI,
      MIN_POLAR,
      MAX_POLAR,
    );
  }

  private pan(dx: number, dy: number): void {
    const h = this.el.clientHeight || 1;
    const worldPerPx =
      (2 * this.goal.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
    const az = this.goal.azimuth;
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    const tilt = 1 / Math.max(0.35, Math.cos(this.goal.polar));
    this.goal.target.addScaledVector(right, -dx * worldPerPx);
    this.goal.target.addScaledVector(fwd, dy * worldPerPx * Math.min(tilt, 2.5));
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, -this.limit, this.limit);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, -this.limit, this.limit);
  }

  private zoom(factor: number): void {
    this.goal.distance = THREE.MathUtils.clamp(
      this.goal.distance * factor,
      this.minDistance,
      this.maxDistance,
    );
  }

  // --- DOM handlers ---------------------------------------------------------

  private onContext = (e: Event): void => e.preventDefault();

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.down = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        moved: false,
      };
    } else {
      if (this.down) this.down.moved = true; // multi-touch never taps
      const [a, b] = [...this.pointers.values()];
      this.twoStart = { a: { ...a }, b: { ...b } };
      this.twoMode = 'undecided';
    }
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.enabled) return;
    const cur = { x: e.clientX, y: e.clientY };
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (this.down && Math.hypot(cur.x - this.down.x, cur.y - this.down.y) > TAP_MAX_PX) {
      if (!this.down.moved) this.onInteract?.();
      this.down.moved = true;
    }
    if (this.pointers.size === 1) {
      this.pointers.set(e.pointerId, cur);
      if (!this.down?.moved) return;
      const panBtn = e.pointerType === 'mouse' && (e.buttons & 2 || e.shiftKey);
      if (panBtn) this.pan(dx, dy);
      else if (e.pointerType === 'mouse' && e.ctrlKey) this.pitch(dy);
      else this.orbit(dx, dy);
      return;
    }
    if (this.pointers.size === 2) this.twoFinger(e.pointerId, cur);
  };

  private twoFinger(id: number, cur: Pt): void {
    const ids = [...this.pointers.keys()];
    const oldA = this.pointers.get(ids[0])!;
    const oldB = this.pointers.get(ids[1])!;
    this.pointers.set(id, cur);
    const a = this.pointers.get(ids[0])!;
    const b = this.pointers.get(ids[1])!;

    if (this.twoMode === 'undecided' && this.twoStart) {
      const s = this.twoStart;
      const ma = { x: a.x - s.a.x, y: a.y - s.a.y };
      const mb = { x: b.x - s.b.x, y: b.y - s.b.y };
      if (Math.max(Math.hypot(ma.x, ma.y), Math.hypot(mb.x, mb.y)) < GESTURE_LOCK_PX) return;
      const sideBySide = Math.abs(s.a.x - s.b.x) > Math.abs(s.a.y - s.b.y);
      const sameVertical = ma.y * mb.y > 0 && Math.abs(ma.y) > 2 * Math.abs(ma.x);
      const spread = Math.abs(
        Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y),
      );
      this.twoMode = sideBySide && sameVertical && spread < GESTURE_LOCK_PX ? 'pitch' : 'panzoom';
      this.onInteract?.();
    }

    const cOld = { x: (oldA.x + oldB.x) / 2, y: (oldA.y + oldB.y) / 2 };
    const cNew = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.twoMode === 'pitch') {
      this.pitch(cNew.y - cOld.y);
      return;
    }
    const dOld = Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y);
    const dNew = Math.hypot(a.x - b.x, a.y - b.y);
    if (dOld > 1 && dNew > 1) this.zoom(dOld / dNew);
    const angOld = Math.atan2(oldB.y - oldA.y, oldB.x - oldA.x);
    const angNew = Math.atan2(b.y - a.y, b.x - a.x);
    let dAng = angNew - angOld;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    this.goal.azimuth += dAng;
    this.pan(cNew.x - cOld.x, cNew.y - cOld.y);
  }

  private onUp = (e: PointerEvent): void => {
    const d = this.down;
    if (d && d.id === e.pointerId && this.pointers.size === 1 && !d.moved) {
      if (performance.now() - d.t < TAP_MAX_MS && this.enabled) this.onTap?.(e);
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.twoStart = null;
    if (this.pointers.size === 0) this.down = null;
    else if (this.pointers.size === 1) {
      // continue as single-finger orbit from the remaining finger without jumping
      const [id, p] = [...this.pointers.entries()][0];
      this.down = { id, x: p.x, y: p.y, t: 0, moved: true };
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.onInteract?.();
    this.zoom(Math.exp(e.deltaY * 0.0012));
  };

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContext);
  }
}
