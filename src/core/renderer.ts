/**
 * Renderer factory. Milestone 1 is locked to WebGLRenderer (see docs/DECISIONS.md:
 * WebGPU gate). Everything else talks to the renderer through this module so a
 * WebGPU backend can be added later without rewriting layers.
 */
import * as THREE from 'three';

export type RendererBackend = 'webgl' | 'webgpu';

export interface RendererInfo {
  backend: RendererBackend;
  webgpuAvailable: boolean;
}

export function createRenderer(canvas: HTMLCanvasElement): {
  renderer: THREE.WebGLRenderer;
  info: RendererInfo;
} {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // MSAA handled by the composer render target per quality level
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: false,
    preserveDrawingBuffer: new URLSearchParams(location.search).has('headless'),
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.info.autoReset = false; // engine resets once per frame (composer = many passes)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x
  return {
    renderer,
    info: { backend: 'webgl', webgpuAvailable: 'gpu' in navigator },
  };
}
