import helsinki from './helsinki.json';

export interface CityConfig {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  size: { width: number; depth: number; below: number; above: number };
  crs: string;
  heightSystem: string;
  seaLevel: number;
  attribution: string;
  camera: { position: [number, number, number]; target: [number, number, number] };
  layers: {
    terrain: { source: string; url: string; heightmap: string; meta: string };
    ortho: { source: string; url: string; layer: string };
    buildings: { source: string; url: string };
    water: { source: string; url: string; typeNames: string[]; file: string };
    transit: { source: string; mqtt: string; modes: string[]; file: string; attribution: string };
  };
}

export const CITIES: Record<string, CityConfig> = {
  helsinki: helsinki as CityConfig,
};

export function getCity(id = 'helsinki'): CityConfig {
  const c = CITIES[id];
  if (!c) throw new Error(`Unknown city: ${id}`);
  return c;
}
