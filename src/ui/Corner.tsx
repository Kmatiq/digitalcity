import type { ReactElement } from 'react';
import { useAppState } from '../core/store';
import { versionLabel } from '../core/version';

/** Always-visible attribution of visible layers, version stamp and FPS/ms meter. */
export function Corner({ cityAttribution }: { cityAttribution: string }): ReactElement {
  const layers = useAppState((s) => s.layers);
  const stats = useAppState((s) => s.stats);
  const loading = useAppState((s) => s.loading);
  const visible = layers.filter((l) => l.visible);
  const schematic = visible.some((l) => l.isSchematic);
  return (
    <div className="corner">
      <div className="meter" title="Bildfrekvens och bildtid">
        {loading > 0 && <i className="dot" aria-label="laddar" />}
        {stats.fps} fps · {stats.frameMs} ms
      </div>
      <div className="attr">
        © {cityAttribution}
        {schematic && <span> · Jordlager schematiska</span>}
      </div>
      <div className="ver">{versionLabel()}</div>
    </div>
  );
}
