import type { QualityLevel } from './types';

export interface QualityPreset {
  maxPixelRatio: number;
  minPixelRatio: number; // floor for dynamic resolution
  shadows: 'none' | 'single' | 'csm';
  shadowMapSize: number;
  cascades: number;
  ao: boolean;
  bloom: boolean;
  msaa: number;
  /** 3D Tiles screen-space error target (px); lower = more detail. */
  tilesErrorTarget: number;
  /** Max ortho texture size for the nearest ground tiles. */
  orthoMaxSize: number;
  /** Ground mesh vertex spacing in meters. */
  groundSpacing: number;
  /** Target frame time for dynamic resolution (ms). */
  targetFrameMs: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: {
    maxPixelRatio: 1,
    minPixelRatio: 0.6,
    shadows: 'none',
    shadowMapSize: 1024,
    cascades: 1,
    ao: false,
    bloom: false,
    msaa: 0,
    tilesErrorTarget: 24,
    orthoMaxSize: 512,
    groundSpacing: 8,
    targetFrameMs: 33,
  },
  medium: {
    maxPixelRatio: 1.5,
    minPixelRatio: 0.75,
    shadows: 'single',
    shadowMapSize: 2048,
    cascades: 1,
    ao: false,
    bloom: false,
    msaa: 0,
    tilesErrorTarget: 12,
    orthoMaxSize: 1024,
    groundSpacing: 4,
    targetFrameMs: 33,
  },
  high: {
    maxPixelRatio: 2,
    minPixelRatio: 1,
    shadows: 'csm',
    shadowMapSize: 2048,
    cascades: 3,
    ao: true,
    bloom: false, // M1: off (HDR sky veils the scene); returns with night lights in M3
    msaa: 4,
    tilesErrorTarget: 6,
    orthoMaxSize: 2048,
    groundSpacing: 2,
    targetFrameMs: 16.7,
  },
  ultra: {
    maxPixelRatio: 2.5,
    minPixelRatio: 1.25,
    shadows: 'csm',
    shadowMapSize: 4096,
    cascades: 4,
    ao: true,
    bloom: false, // M1: off (HDR sky veils the scene); returns with night lights in M3
    msaa: 4,
    tilesErrorTarget: 3,
    orthoMaxSize: 4096,
    groundSpacing: 2,
    targetFrameMs: 16.7,
  },
};

/** Pick a sensible default from the device. */
export function defaultQuality(): QualityLevel {
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (narrow || coarse) return 'medium';
  return 'high';
}
