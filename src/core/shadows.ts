/**
 * Shadow strategies per quality: none, a single camera-fitted shadow map, or
 * cascaded shadow maps (CSM). Materials are registered once and re-configured
 * when the strategy changes.
 */
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { Environment } from './environment';

type Material = THREE.Material;
import type { QualityPreset } from './quality';

export class Shadows {
  private csm: CSM | null = null;
  private materials = new Set<THREE.Material>();
  private preset: QualityPreset | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private env: Environment,
  ) {}

  register(m: THREE.Material): void {
    this.materials.add(m);
    if (this.csm) this.setupCsm(m);
    m.addEventListener('dispose', () => this.materials.delete(m));
  }

  /** CSM replaces onBeforeCompile; chain any material-specific patch (userData.baseOnBeforeCompile). */
  private setupCsm(m: THREE.Material): void {
    this.csm!.setupMaterial(m);
    const base = m.userData.baseOnBeforeCompile as Material['onBeforeCompile'] | undefined;
    if (!base) return;
    const csmFn = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      base.call(m, shader, r);
      csmFn.call(m, shader, r);
    };
  }

  private restoreBase(m: THREE.Material): void {
    const base = m.userData.baseOnBeforeCompile as Material['onBeforeCompile'] | undefined;
    if (base) m.onBeforeCompile = base;
    m.needsUpdate = true;
  }

  setPreset(p: QualityPreset): void {
    this.preset = p;
    this.csm?.remove();
    this.csm?.dispose();
    this.csm = null;
    const sun = this.env.sun;
    this.renderer.shadowMap.enabled = p.shadows !== 'none';
    sun.castShadow = p.shadows === 'single';
    if (p.shadows === 'single') {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
    }
    if (p.shadows === 'csm') {
      this.csm = new CSM({
        camera: this.camera,
        parent: this.scene,
        cascades: p.cascades,
        maxFar: 3500,
        mode: 'practical',
        shadowMapSize: p.shadowMapSize,
        shadowBias: -0.0002,
        lightDirection: this.env.sunDir.clone().negate(),
        lightIntensity: this.env.sun.intensity,
        lightNear: 1,
        lightFar: 6000,
        lightMargin: 400,
      });
      this.csm.fade = true;
      for (const l of this.csm.lights) l.shadow.normalBias = 0.4;
      this.materials.forEach((m) => this.setupCsm(m));
    } else {
      this.materials.forEach((m) => this.restoreBase(m));
    }
    sun.visible = p.shadows !== 'csm';
  }

  /** Call when camera near/far changed so cascades are rebuilt. */
  private lastNearFar = '';

  update(target: THREE.Vector3, distance: number): void {
    const env = this.env;
    if (this.csm) {
      const key = `${this.camera.near.toFixed(1)}:${this.camera.far.toFixed(0)}`;
      if (key !== this.lastNearFar) {
        this.lastNearFar = key;
        this.csm.updateFrustums();
      }
      this.csm.lightDirection.copy(env.sunDir).negate();
      for (const l of this.csm.lights) {
        l.intensity = env.sun.intensity; // CSM shades each fragment with one cascade
        l.color.copy(env.sun.color);
      }
      this.csm.update();
      return;
    }
    // single: fit the ortho shadow frustum around the orbit target
    const half = THREE.MathUtils.clamp(distance * 0.85, 120, 1450);
    env.placeSun(target, 3000);
    if (this.preset?.shadows === 'single') {
      const cam = env.sun.shadow.camera;
      if (cam.right !== half) {
        cam.left = cam.bottom = -half;
        cam.right = cam.top = half;
        cam.near = 100;
        cam.far = 6000;
        cam.updateProjectionMatrix();
      }
    }
  }

  dispose(): void {
    this.csm?.remove();
    this.csm?.dispose();
  }
}
