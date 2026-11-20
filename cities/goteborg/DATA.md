# Göteborg — datakällor

Verifierat **2026-11-20** från Claude Codes molnmiljö (CORS testat med
`Origin: https://kmatiq.github.io`). Platta 2 × 2 km kring **Gustaf Adolfs torg**
(57,7072 N, 11,9668 Ö). Höjdsystem **RH2000** (`y = 0`), stadens CRS **SWEREF 99 12 00
(EPSG:3007)**.

## Används i steg 1

| Lager | Källa / adress | Format | Licens | Åtkomst | Noteringar |
| --- | --- | --- | --- | --- | --- |
| Ortofoto 2025 (strömmas) | `https://opengeodata.goteborg.se/services/ortofoto/wms/v1`, lager `orto_2025` | WMS 1.1.1/1.3.0, EPSG:3007/3006/3857 | **CC0** | Öppen, CORS `*` | 2048 px ≈ 3 s, 4096 px ≈ 6 s per 250 m-ruta. Även `orto_2015 … orto_2023` (för Tidsresenären). |
| Höjdmodell 2022 (förbehandlad) | `https://opengeodata.goteborg.se/services/hojdmodell/wcs/v2`, coverage `hojdmodell-v2__hojdgrid` | WCS 2.0.1, GeoTIFF Float32, 0,5 m | **CC0** | Öppen, CORS `*` | Laserbaserad markmodell med vattenytor och interpolerad höjd under byggnader. `npm run pipeline:terrain-wcs` (25 anrop à 500 m, ~18 s) → `terrain.bin` (2 m-grid). Även WMS `…/hojdmodell/wms/v2` och GeoTIFF-zip. |
| Vatten (härlett) | Höjdmodellen ovan | — | CC0 | — | Celler ≤ 0,3 m RH2000 i sammanhängande ytor ≥ 400 celler = vatten (Göta älv, Vallgraven, Stora Hamnkanalen, Fattighusån). Havsbotten **schematisk** (samma regel som Helsingfors). Vattenytan ritas som ett plan som marken skymmer. |
| Byggnader LOD1 (förbehandlade) | Baskarta, `https://opengeodata.goteborg.se/downloads/baskarta/baskarta_shp_v2.zip` (708 MB, uppdateras dagligen) | Shapefile, `byggnad_l` = **PolyLineZ** (fotogrammetriska 3D-linjer) | **CC0** | Öppen | `typ = Takkonturer` (takkonturer med höjd i RH2000) → slutna ringar → fotavtryck med innergårdar. `BASKARTA_DIR=… npm run pipeline:buildings-gbg` → `buildings.json` (368 KB, 1 214 byggnader, 451 gårdar). Höjd = median av konturens Z (≈ takfot). |

### Kända luckor (steg 1)

- **309 öppna konturkedjor** kunde inte slutas (tak som delar linjer i T-korsningar) →
  några kvarter saknar byggnad. Kräver planar polygonisering eller Lantmäteriets fotavtryck.
- Överlappande fotavtryck på samma höjd ger z-fighting på vissa tak.
- Platta tak (LOD1). Konturerna har höjd per hörn, så LOD1,5–2 är möjligt senare.
- **Ingen adress/byggår/användning** i baskartan. Klickkortet visar höjd, uppskattade
  våningar, takfot och marknivå.

## Verifierat men kräver konto (Lantmäteriet, Geotorget)

STAC-katalogerna är öppna med CORS `*`, men filerna på `dl1.lantmateriet.se` svarar **401**
utan inloggning (gratis Geotorget-konto, användarnamn/lösenord). Får **bara** användas i
offline-pipelinen via miljöns nätverkshemligheter — aldrig i appen.

| Data | STAC | Licens | Värde för projektet |
| --- | --- | --- | --- |
| Byggnader (vektor, per kommun; Göteborg = `byggnad_kn1480.zip`) | `https://api.lantmateriet.se/stac-vektor/v1/collections/byggnader` | CC BY 4.0 | Fullständiga fotavtryck + ändamål (bostad, industri …) → fyller luckorna ovan. |
| Belägenhetsadresser | `…/stac-vektor/v1/collections/belagenhetsadresser` | CC BY 4.0 | Adress i klickkortet. |
| Marktäcke | `…/stac-vektor/v1/collections/marktacke` | CC BY 4.0 | Vattenpolygoner, skog, öppen mark. |
| Markhöjdmodell 1 m (COG) | `https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog` | CC BY 4.0 | Alternativ till stadens höjdmodell (rikstäckande). |
| Ythöjdmodell 0,25 m, 2026 (COG) | `…/stac-hojd/v1/collections/dsm-cog` | **"other"** — villkor ej klarlagda | Takformer (LOD2) via DSM − DTM. **Används inte** förrän licensen är bekräftad. |
| Ortofoto 16 cm, 2026 (COG) | `https://api.lantmateriet.se/stac-bild/v1/` (t.ex. `orto-g2-2026`) | CC BY 4.0 | Stadens WMS räcker. Lantmäteriets öppna visnings-WMS `https://minkarta.lantmateriet.se/map/ortofoto/` (lager `Ortofoto_0.16`, utan inloggning, CORS) är reserv. |

## Inte tillgängligt här (än)

| Data | Status |
| --- | --- |
| Göteborgs 3D-stadsmodell (CityGML LOD2) | Finns hos staden men säljs — ingen öppen version hittad. |
| OpenStreetMap via Overpass | `overpass-api.de` ger TLS-fel genom miljöns proxy; att gå runt via speglar nekades. Kan aktiveras om du tillåter det. |
| Västtrafik realtid (steg 2) | Trafiklab GTFS Regional (`vt`) kräver API-nyckel → offline-pipeline för statiskt GTFS; realtid i webbläsaren kräver en proxy/relä utan nyckel i klienten. |
