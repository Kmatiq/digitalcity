/**
 * Live public transport: HSL HFP vehicles (tram, bus, ferry) on their real positions
 * plus the static route network from GTFS. Game modes can tint vehicles/highlight lines.
 */
import * as THREE from 'three';
import type { MqttClient } from 'mqtt';
import type { CityConfig } from '../../cities/cityConfig';
import { store } from '../../core/store';
import type { CityContext, Layer, PickResult, QualityLevel, SimTime } from '../../core/types';
import { connectHfp, geohashCells, hfpTopics, type HfpStatus } from './hfpClient';
import { NetworkLines } from './networkLines';
import { loadNetwork, type TransitMode, type TransitNetwork } from './transitData';
import { VehicleMeshes, type Tint } from './vehicleMeshes';
import { VehicleStore, type Vehicle } from './vehicleStore';

const MODE_SV: Record<TransitMode, string> = { tram: 'Spårvagn', bus: 'Buss', ferry: 'Färja' };

export class TransitLayer implements Layer {
  id = 'transit';
  label = 'Kollektivtrafik (live)';
  category = 'live' as const;
  attribution = ['Kollektivtrafik: HSL (CC BY 4.0), realtid via HFP/MQTT'];
  credit = 'HSL (CC BY 4.0)';
  visible = true;

  network: TransitNetwork | null = null;
  /** Created in load(); undefined until the layer has started loading. */
  vehicles?: VehicleStore;
  lines: NetworkLines | null = null;
  /** Game modes may override vehicle tinting. */
  tintOf: (v: Vehicle) => Tint = () => 'normal';
  status: HfpStatus = 'connecting';

  private meshes: VehicleMeshes | null = null;
  private client: MqttClient | null = null;
  private ctx!: CityContext;
  private group = new THREE.Group();

  private cfg: NonNullable<CityConfig['layers']['transit']>;

  constructor(city: CityConfig) {
    if (!city.layers.transit) throw new Error(`${city.id} has no transit config`);
    this.cfg = city.layers.transit;
    this.group.name = 'transit';
  }

  async load(ctx: CityContext, signal: AbortSignal): Promise<void> {
    this.ctx = ctx;
    const { halfWidth: hw, halfDepth: hd } = ctx.bounds;
    this.vehicles = new VehicleStore(
      (lon, lat) => {
        const p = ctx.toLocal(lon, lat, 0);
        return [p.x, p.z];
      },
      (x, z) => Math.abs(x) <= hw && Math.abs(z) <= hd,
    );
    this.network = await loadNetwork(ctx.resolveUrl(this.cfg.file), signal);
    this.lines = new NetworkLines(this.network, ctx.groundHeight);
    this.meshes = new VehicleMeshes((m) => ctx.registerMaterial(m));
    this.group.add(this.lines.group, this.meshes.group);
    ctx.scene.add(this.group);

    const corners = [
      [-hw, -hd],
      [hw, hd],
      [-hw, hd],
      [hw, -hd],
    ].map(([x, z]) => ctx.fromLocal(new THREE.Vector3(x, 0, z)));
    const cells = geohashCells({
      minLat: Math.min(...corners.map((c) => c.lat)),
      maxLat: Math.max(...corners.map((c) => c.lat)),
      minLon: Math.min(...corners.map((c) => c.lon)),
      maxLon: Math.max(...corners.map((c) => c.lon)),
    });
    const modes = this.cfg.modes as TransitMode[];
    this.client = await connectHfp(
      this.cfg.mqtt,
      hfpTopics(modes, cells),
      (u) => this.vehicles?.ingest(u),
      (s) => {
        this.status = s;
        store.setLayer(this.id, { message: s });
      },
      signal,
    );
  }

  update(_t: SimTime, dt: number): void {
    if (!this.meshes || !this.vehicles) return;
    this.vehicles.update(dt);
    const d = this.ctx.camera.position.distanceTo(this.ctx.focus);
    const scale = THREE.MathUtils.clamp(d / 700, 1, 4);
    this.meshes.showLabels = d < 1600;
    this.meshes.sync(this.vehicles.vehicles.values(), this.ctx.groundHeight, scale, this.tintOf);
  }

  /** Nearest vehicle to the ray (generous angular radius so it is tappable on phones). */
  pickVehicle(raycaster: THREE.Raycaster): { v: Vehicle; distance: number } | null {
    let best: { v: Vehicle; distance: number } | null = null;
    const p = new THREE.Vector3();
    const ray = raycaster.ray;
    if (!this.vehicles) return null;
    for (const v of this.vehicles.vehicles.values()) {
      p.set(v.x, this.ctx.groundHeight(v.x, v.z) + 2, v.z);
      const along = p.clone().sub(ray.origin).dot(ray.direction);
      if (along <= 0) continue;
      const radius = Math.max(10, along * 0.025);
      const off = ray.distanceToPoint(p);
      if (off > radius) continue;
      const score = along * (0.6 + off / radius);
      if (!best || score < best.distance) best = { v, distance: score };
    }
    return best;
  }

  pick(raycaster: THREE.Raycaster): (PickResult & { distance: number }) | null {
    const hit = this.pickVehicle(raycaster);
    if (!hit) return null;
    const v = hit.v;
    const late = v.delay === null ? null : Math.round(v.delay / 60);
    return {
      layerId: this.id,
      distance: hit.distance * 0.6, // prefer vehicles over the building behind them
      title: `${MODE_SV[v.mode]} ${v.line}`,
      properties: {
        Mot: v.headsign || null,
        Försening:
          late === null
            ? null
            : late > 0
              ? `${late} min`
              : late < 0
                ? `${-late} min före`
                : 'i tid',
        Fart: `${Math.round(v.speed * 3.6)} km/h`,
      },
    };
  }

  setQuality(_q: QualityLevel): void {}

  setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = v;
  }

  dispose(): void {
    this.client?.end(true);
    this.lines?.dispose();
    this.meshes?.dispose();
    this.group.removeFromParent();
  }
}
