import type { ReactElement } from 'react';
import { useAppState } from '../core/store';
import { QUALITY_LEVELS, type QualityLevel } from '../core/types';

const LABEL: Record<QualityLevel, string> = {
  low: 'Låg',
  medium: 'Medel',
  high: 'Hög',
  ultra: 'Ultra',
};

export function QualityPicker({
  onChange,
  compact = false,
}: {
  onChange(q: QualityLevel): void;
  compact?: boolean;
}): ReactElement {
  const q = useAppState((s) => s.quality);
  return (
    <div
      className={`seg${compact ? ' compact' : ''}`}
      role="radiogroup"
      aria-label="Grafikkvalitet"
    >
      {QUALITY_LEVELS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={q === l}
          className={q === l ? 'on' : ''}
          onClick={() => onChange(l)}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
