/**
 * Engine: owns renderer, scene, camera, loop, quality and the shared CityContext.
 * Layers and modes plug in through LayerManager / ModeManager.
 */
import * as THREE from 'three';
import type { CityConfig } from '../cities/cityConfig';
import { Clock } from './clock';
import { createFrame, localToWgs84, wgs84ToLocal } from './coordinates';
import { DioramaControls } from './controls';
import { Environment } from './environment';
import { FetchQueue } from './fetchQueue';
import { HeightField } from './heightfield';
import { LayerManager } from './layerManager';
import { PostProcessing } from './postprocessing';
import { QUALITY } from './quality';
import { createRenderer } from './renderer';
import { Shadows } from './shadows';
import { FrameMeter } from './stats';
import { store } from './store';
import type { CityContext, QualityLevel } from './types';
import { ModeManager } from '../modes/modeManager';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 1, 40000);
  readonly clock = new Clock();
  readonly controls: DioramaControls;
  readonly env: Environment;
  readonly headless = new URLSearchParams(location.search).has('headless');
  ctx!: CityContext;
  layers!: LayerManager;
  modes!: ModeManager;

  private shadows: Shadows;
  private post: PostProcessing;
  private meter = new FrameMeter();
  private raycaster = new THREE.Raycaster();
  private quality: QualityLevel = 'medium';
  private pixelRatio = 1;
  private running = false;
  private resizeObs: ResizeObserver;
  /** Menu mode on narrow screens: shift the view so the diorama sits above the menu panel. */
  menuFraming = false;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly city: CityConfig,
  ) {
    this.renderer = createRenderer(canvas).renderer;
    this.controls = new DioramaControls(this.camera, canvas);
    this.env = new Environment(this.renderer, this.scene, city.center.lat, city.center.lon);
    this.shadows = new Shadows(this.renderer, this.scene, this.camera, this.env);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.controls.onTap = (e) => this.tap(e);
  }

  async init(quality: QualityLevel): Promise<void> {
    const c = this.city;
    const halfW = c.size.width / 2;
    const halfD = c.size.depth / 2;
    const frame = createFrame(c.center.lat, c.center.lon);
    const base = import.meta.env.BASE_URL;
    const resolveUrl = (p: string): string => `${base}${p}`;
    const heights = await HeightField.load(
      resolveUrl(c.layers.terrain.heightmap),
      resolveUrl(c.layers.terrain.meta),
      halfW,
      halfD,
    );
    const eps = 0.02; // keep slab walls (exactly at the edge) visible
    const clipPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), halfW + eps),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), halfW + eps),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), halfD + eps),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), halfD + eps),
    ];
    this.post.clipPlanes = clipPlanes; // AO normal pass must clip like the beauty pass

    this.ctx = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      bounds: { halfWidth: halfW, halfDepth: halfD, minY: -c.size.below, maxY: c.size.above },
      clipPlanes,
      seaLevel: c.seaLevel,
      heights,
      queue: new FetchQueue(6, 25000),
      focus: this.controls.target,
      registerMaterial: (m, opts) => {
        if (opts?.clip !== false) {
          m.clippingPlanes = clipPlanes;
          m.clipShadows = true;
        }
        this.shadows.register(m);
      },
      toLocal: (lon, lat, elev = 0) => new THREE.Vector3(...wgs84ToLocal(frame, lon, lat, elev)),
      fromLocal: (p) => {
        const [lon, lat, elev] = localToWgs84(frame, [p.x, p.y, p.z]);
        return { lon, lat, elev };
      },
      groundHeight: (x, z) => heights.sample(x, z),
      resolveUrl,
    };
    this.layers = new LayerManager(this.ctx);
    this.modes = new ModeManager(this.ctx);
    this.setCamera(new THREE.Vector3(...c.camera.position), new THREE.Vector3(...c.camera.target));
    this.setQuality(quality);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const dt = this.clock.tick();
    const t = this.clock.time;
    this.controls.update(dt);
    this.env.update(t.date);
    this.shadows.update(this.controls.target, this.controls.distance);
    this.modes.update(t, dt);
    this.layers.update(t, dt);
    this.renderer.info.reset();
    this.post.render(dt);
    const s = this.meter.frame(this.renderer.info, this.pixelRatio);
    if (s) {
      store.set({
        stats: s,
        simTime: t.date.getTime(),
        isLive: t.isLive,
        loading: this.ctx.queue.size + this.layers.pending(),
      });
      if (!this.headless) this.adaptResolution(s.frameMs);
    }
  }

  /** Dynamic resolution: nudge pixel ratio within the preset's range. */
  private adaptResolution(frameMs: number): void {
    const p = QUALITY[this.quality];
    const max = Math.min(p.maxPixelRatio, window.devicePixelRatio || 1);
    const min = Math.min(p.minPixelRatio, max);
    let next = this.pixelRatio;
    if (frameMs > p.targetFrameMs * 1.25) next = Math.max(min, next - 0.1);
    else if (frameMs < p.targetFrameMs * 0.7) next = Math.min(max, next + 0.05);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.resize();
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    if (this.menuFraming && w < 600) this.camera.setViewOffset(w, h, 0, h * 0.24, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    const p = QUALITY[q];
    this.pixelRatio = Math.min(p.maxPixelRatio, window.devicePixelRatio || 1);
    this.shadows.setPreset(p);
    this.post.setPreset(p);
    this.layers?.setQuality(q);
    this.resize();
    store.set({ quality: q });
  }

  setCamera(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.controls.set(pos, target, true);
  }

  resetCamera(): void {
    const c = this.city.camera;
    this.controls.set(new THREE.Vector3(...c.position), new THREE.Vector3(...c.target), false);
  }

  private tap(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    this.modes.tap(e, this.raycaster);
  }

  capture(): string {
    this.post.render(0);
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.layers?.dispose();
    this.shadows.dispose();
    this.post.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
