declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

export function versionLabel(): string {
  const d = new Date(BUILD_TIME);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${APP_VERSION} · ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}
