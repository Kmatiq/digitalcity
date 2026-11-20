/**
 * Post-processing chain. Low/medium render straight to the canvas (tone mapping in
 * the renderer). High/ultra use: MSAA render target -> GTAO -> subtle bloom -> Output
 * (AgX tone mapping + sRGB).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityPreset } from './quality';

export class PostProcessing {
  private composer: EffectComposer | null = null;
  private ao: GTAOPass | null = null;
  clipPlanes: THREE.Plane[] = [];

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {}

  setPreset(p: QualityPreset): void {
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    if (!p.ao && !p.bloom && p.msaa === 0) return;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: p.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (p.ao && !new URLSearchParams(location.search).has('noao')) {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 3, distanceExponent: 1.5, thickness: 2, scale: 1 });
      ao.blendIntensity = 0.85;
      ao.normalMaterial.clippingPlanes = this.clipPlanes;
      composer.addPass(ao);
      this.ao = ao;
    }
    const dbg = new URLSearchParams(location.search);
    if (p.bloom && !dbg.has('nobloom')) {
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.12, 0.4, 0.92));
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.composer?.dispose();
    this.ao?.dispose();
  }
}
