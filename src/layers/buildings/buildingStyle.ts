/** "Model" mode styling and attribute formatting for Helsinki LOD2 buildings. */
import * as THREE from 'three';

export type BuildingProps = Record<string, unknown>;

const USAGE_SV: Record<string, string> = {
  Asuinrakennus: 'Bostadshus',
  Liikerakennus: 'Affärsbyggnad',
  Toimistorakennus: 'Kontorsbyggnad',
  Julkinen: 'Offentlig byggnad',
  Opetusrakennus: 'Skolbyggnad',
  Kokoontumisrakennus: 'Samlingslokal',
  Hoitoalan_rakennus: 'Vårdbyggnad',
  Hoitoalan: 'Vårdbyggnad',
  Liikenteen_rakennus: 'Trafikbyggnad',
  Liikenteen: 'Trafikbyggnad',
  Varastorakennus: 'Lagerbyggnad',
  Tehdas: 'Fabrik',
  Talousrakennus: 'Ekonomibyggnad',
  Pienteollisuusrakennus: 'Småindustri',
  Teollisuusrakennus: 'Industribyggnad',
  Uskonnollinen: 'Kyrka / religiös byggnad',
  Kirkko: 'Kyrka',
  Sairaala: 'Sjukhus',
  Kauppa: 'Butik / kiosk',
  Hotelli: 'Hotell',
  Ravintola: 'Restaurang',
  Museo: 'Museum',
  Kirjasto: 'Bibliotek',
  Teatteri: 'Teater',
  Koulu: 'Skola',
  Päiväkoti: 'Daghem',
  Asema: 'Station',
  Pysäköinti: 'Parkering',
  'Muu rakennus': 'Övrig byggnad',
  Muu: 'Övrigt',
};

const isNoData = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === 'NODATA' ||
  v === '' ||
  (typeof v === 'number' && (v < -1e9 || v === 5e-324));

export function str(p: BuildingProps, key: string): string | null {
  const v = p[key];
  return isNoData(v) ? null : String(v);
}

export function num(p: BuildingProps, key: string): number | null {
  const v = p[key];
  if (isNoData(v)) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Construction year: values are stored as local midnight 31 Dec, e.g. 1985-12-30T22:00Z. */
export function constructionYear(p: BuildingProps): number | null {
  const s = str(p, 'dateOfConstruction');
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 3 * 3600_000).getUTCFullYear();
}

export function usageLabel(p: BuildingProps): string | null {
  const u = str(p, 'usage');
  if (!u) return null;
  const key = Object.keys(USAGE_SV).find((k) => u.startsWith(k));
  return key ? USAGE_SV[key] : u;
}

export function addressLabel(p: BuildingProps): string | null {
  const a = str(p, 'address');
  if (!a || a === 'Helsinki Finland') return null;
  return a.replace(/\s*Helsinki Finland$/, '').replace(/,\s*$/, '');
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const C = (hex: number): THREE.Color => new THREE.Color(hex);
const PALETTE = {
  // pre-1930 stone town: ochre, salmon, sand, pale green, granite grey
  oldResidential: [C(0xd1a25a), C(0xd9b06e), C(0xc98a62), C(0xc9b17f), C(0xa8b087), C(0xb7aa98)],
  // 1930–1969 functionalism: off-white, pale yellow, light brick
  midResidential: [C(0xe0d6b8), C(0xd9c48e), C(0xe6dfcc), C(0xc49272), C(0xcfc0a0)],
  // 1970+: concrete greys, beige, dark brick
  newResidential: [C(0xbfb9ad), C(0xb0a694), C(0xa5654c), C(0xc8c0b0), C(0x9d9c97)],
  commercial: [C(0xb8b2a6), C(0x9fa7ab), C(0xc9b896), C(0x8f8a84), C(0xd2c7b0)],
  public: [C(0xe8e0cc), C(0xded2b6), C(0xd8c49a)],
  industrial: [C(0x9d9488), C(0x8f7f72), C(0xa6998a)],
  // mostly dark sheet metal, some patina green, few red tin roofs
  roofOld: [
    C(0x34393c),
    C(0x2b2f31),
    C(0x3d4446),
    C(0x2f3b38),
    C(0x4a5a52),
    C(0x34393c),
    C(0x7a3f30),
  ],
  roofNew: [C(0x6a6d6d), C(0x5d6161), C(0x777774)],
};

export interface BuildingColors {
  wall: THREE.Color;
  roof: THREE.Color;
}

export function buildingColors(p: BuildingProps): BuildingColors {
  const usage = str(p, 'usage') ?? '';
  const year = constructionYear(p) ?? 1970;
  const h = hash01(str(p, 'id') ?? String(Math.random()));
  const pick = (arr: THREE.Color[]): THREE.Color => arr[Math.floor(h * arr.length) % arr.length];
  let wall: THREE.Color;
  if (/Asuin/.test(usage)) {
    wall = pick(
      year < 1930
        ? PALETTE.oldResidential
        : year < 1970
          ? PALETTE.midResidential
          : PALETTE.newResidential,
    );
  } else if (/Liike|Toimisto/.test(usage)) wall = pick(PALETTE.commercial);
  else if (/Julki|Opetus|Kokoontu|Hoito|Uskonn|Kirkko/.test(usage)) wall = pick(PALETTE.public);
  else if (/Tehdas|Teoll|Varasto|Talous/.test(usage)) wall = pick(PALETTE.industrial);
  else wall = pick(year < 1930 ? PALETTE.oldResidential : PALETTE.newResidential);
  const h2 = (h * 7.31) % 1; // decorrelate roof from wall choice
  const roofs = year < 1960 ? PALETTE.roofOld : PALETTE.roofNew;
  const roof = roofs[Math.floor(h2 * roofs.length) % roofs.length];
  const jitter = 0.9 + h * 0.16;
  return { wall: wall.clone().multiplyScalar(jitter), roof: roof.clone().multiplyScalar(jitter) };
}
