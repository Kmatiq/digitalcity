/**
 * SCHEMATIC stratigraphy for the slab walls (no open borehole data used in M1):
 * fill/topsoil, clay–sand, then bedrock (Helsinki granite/gneiss) down to minY.
 * Soil thickness varies smoothly along the edge; under the sea a thin clay layer.
 */
import * as THREE from 'three';

export interface Band {
  top: number;
  bottom: number;
  color: THREE.Color;
  kind: 'fill' | 'soil' | 'clay' | 'rock';
}

export const STRATA_COLORS = {
  fill: new THREE.Color(0x4a3426),
  soil: new THREE.Color(0xb8894f),
  clay: new THREE.Color(0x5d6772),
  rock: new THREE.Color(0x8a7b78),
};

/** Deterministic smooth thickness of loose soil (m) along a 1D edge coordinate. */
export function soilThickness(s: number): number {
  const v =
    Math.sin(s * 0.0071 + 1.3) * 0.5 +
    Math.sin(s * 0.0193 + 0.4) * 0.3 +
    Math.sin(s * 0.0511 + 2.2) * 0.2;
  return 4.5 + v * 3.5; // ~1–8 m
}

export function bandsAt(ground: number, s: number, minY: number, seaLevel: number): Band[] {
  const underwater = ground < seaLevel - 0.3;
  const rockTop = Math.max(minY + 1, ground - (underwater ? 1.2 : soilThickness(s)));
  const out: Band[] = [];
  if (underwater) {
    out.push({ top: ground, bottom: rockTop, color: STRATA_COLORS.clay, kind: 'clay' });
  } else {
    const fillBottom = Math.max(rockTop, ground - 0.8);
    out.push({ top: ground, bottom: fillBottom, color: STRATA_COLORS.fill, kind: 'fill' });
    if (fillBottom > rockTop)
      out.push({ top: fillBottom, bottom: rockTop, color: STRATA_COLORS.soil, kind: 'soil' });
  }
  out.push({ top: rockTop, bottom: minY, color: STRATA_COLORS.rock, kind: 'rock' });
  return out;
}
