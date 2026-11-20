/**
 * Sky, sun and image-based lighting driven by real solar position.
 * The sky is rendered into a cube map used as scene.background (so global clip
 * planes never cut it) and pre-filtered with PMREM for IBL.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { sunPosition } from './sun';

const UPDATE_ANGLE = THREE.MathUtils.degToRad(0.5);

export class Environment {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xdfe9f5, 0x6a5e52, 0.4);
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  altitude = 0.5;

  private sky = new Sky();
  private skyScene = new THREE.Scene();
  private cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  private cubeCam = new THREE.CubeCamera(1, 100000, this.cubeRT);
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastDir = new THREE.Vector3(0, -1, 0);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private lat: number,
    private lon: number,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sky.scale.setScalar(50000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.skyScene.add(this.sky);
    scene.background = this.cubeRT.texture;
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  update(date: Date): void {
    const s = sunPosition(date, this.lat, this.lon);
    this.altitude = s.altitude;
    this.sunDir.set(...s.direction);
    const day = THREE.MathUtils.smoothstep(s.altitude, -0.1, 0.12);
    const low = 1 - THREE.MathUtils.smoothstep(s.altitude, 0.02, 0.5);
    this.sun.intensity = 2.6 * THREE.MathUtils.smoothstep(s.altitude, -0.02, 0.1);
    this.sun.color.setRGB(1, 0.97 - 0.22 * low, 0.92 - 0.45 * low);
    this.hemi.intensity = 0.08 + 0.3 * day;
    this.renderer.toneMappingExposure = 0.85 + 0.35 * (1 - day);

    if (this.sunDir.angleTo(this.lastDir) > UPDATE_ANGLE) {
      this.lastDir.copy(this.sunDir);
      this.refreshSky(day);
    }
  }

  private refreshSky(day: number): void {
    // Below the horizon Preetham goes black; keep a dim twilight dome instead.
    const d = this.sunDir.clone();
    if (d.y < -0.05) d.y = -0.05;
    this.sky.material.uniforms.sunPosition.value.copy(d);
    this.sky.material.uniforms.rayleigh.value = 1.4 + 1.5 * (1 - day);
    this.cubeCam.update(this.renderer, this.skyScene);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    this.scene.environment = this.envRT.texture;
    // Preetham radiance is ~2–6 in daylight: scale it so IBL fills shadows without washing out.
    this.scene.environmentIntensity = 0.06 + 0.16 * day;
    this.scene.backgroundIntensity = 0.12 + 0.3 * day;
  }

  /** Place the directional light so its shadow frustum looks at `center`. */
  placeSun(center: THREE.Vector3, distance: number): void {
    this.sun.position.copy(center).addScaledVector(this.sunDir, distance);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.envRT?.dispose();
    this.cubeRT.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
