import type { ProjectedCrs } from '../core/coordinates';
import goteborg from './goteborg.json';
import helsinki from './helsinki.json';

export interface CityConfig {
  id: string;
  name: string;
  country: string;
  center: { lat: number; lon: number };
  size: { width: number; depth: number; below: number; above: number };
  crs: ProjectedCrs;
  heightSystem: string;
  seaLevel: number;
  /** Short credit shown in the always-visible corner. */
  attribution: string;
  camera: { position: [number, number, number]; target: [number, number, number] };
  layers: {
    terrain: {
      source: string;
      url?: string;
      /** WCS coverage id (Göteborg) */
      coverage?: string;
      heightmap: string;
      meta: string;
      attribution: string;
    };
    ortho: {
      source: string;
      url: string;
      layer: string;
      crs: ProjectedCrs;
      attribution: string;
    };
    buildings: {
      source: string;
      /** '3dtiles' = streamed tileset (Helsinki), 'extruded' = pipeline footprints (Göteborg) */
      type: '3dtiles' | 'extruded';
      url?: string;
      file?: string;
      attribution: string;
    };
    water: {
      source: string;
      /** polygons in `file`; without a file the water surface is a plane over the slab */
      file?: string;
      url?: string;
      typeNames?: string[];
      attribution: string;
    };
    transit?: {
      source: string;
      mqtt: string;
      modes: string[];
      file: string;
      attribution: string;
    };
  };
}

export const CITIES: Record<string, CityConfig> = {
  helsinki: helsinki as CityConfig,
  goteborg: goteborg as CityConfig,
};

export function getCity(id = 'helsinki'): CityConfig {
  const c = CITIES[id];
  if (!c) throw new Error(`Unknown city: ${id}`);
  return c;
}
