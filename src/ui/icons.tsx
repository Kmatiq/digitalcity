/** Minimal inline icons (stroke = currentColor). */
import type { ReactElement } from 'react';

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const Icon = {
  home: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  layers: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  ),
  sun: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  gauge: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 18a8 8 0 1116 0" />
      <path d="M12 18l4-6" />
    </svg>
  ),
  target: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  ),
  close: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  lock: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ),
  globe: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  ),
  siren: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M7 18v-5a5 5 0 0110 0v5" />
      <path d="M5 18h14v3H5zM12 2v3M4 6l2 2M20 6l-2 2" />
    </svg>
  ),
  tram: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="6" y="5" width="12" height="13" rx="3" />
      <path d="M6 12h12M9 21l1.5-3M15 21l-1.5-3M10 2h4" />
    </svg>
  ),
  clock: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  data: (): ReactElement => (
    <svg viewBox="0 0 24 24" {...P}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </svg>
  ),
};
