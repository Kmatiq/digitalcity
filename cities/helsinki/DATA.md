# Helsingfors — datakällor (Milstolpe 1)

Verifierat **2026-11-20** från Claude Codes molnmiljö mot `kartta.hel.fi` (CORS testat med
`Origin: https://kmatiq.github.io`). Alla källor nedan: **CC BY 4.0, "Helsingin kaupunki"**.
Källhänvisningen visas alltid i UI:t (`Corner.tsx`) när data syns.

## Används i appen (strömmas i webbläsaren)

| Lager | Adress | Format | CORS | Svarstid | Noteringar |
| --- | --- | --- | --- | --- | --- |
| Byggnader LOD2 | `https://kartta.hel.fi/3d/datasource-data/16fc3fd5-df6d-4f48-bfd5-9aeee430a02f/tileset.json` | 3D Tiles **1.1**, glTF (`.glb`) | speglar origin | ~0,8 s (tileset), ~0,4 MB/tile | **Draco** (`KHR_draco_mesh_compression`) + `EXT_mesh_features` + `EXT_structural_metadata` (en propertyTable per tile). Briefens "utan Draco" stämmer inte längre. Externa tilesets i flera nivåer. Root-transform = ECEF-förflyttning, glTF Y-upp. |
| Flygfoto 5 cm | `https://kartta.hel.fi/ws/geoserver/avoindata/wms`, lager `avoindata:Ortoilmakuva_2025_5cm` | WMS 1.1.1 `GetMap`, `SRS=EPSG:3879`, `image/jpeg` | `*` | 1024 px ≈ 1,5 s · 2048 px ≈ 2 s · 4096 px ≈ 3,8 s (250 m-ruta) | Även `_2026_5cm` och årgångar 1932–2024 (för Tidsresenären, M3). |

### Attribut i byggnadstabellen (urval)

`address`, `usage` (fi, t.ex. *Asuinrakennus*, *Liikerakennus*, *Kirkko*), `function`, `class`,
`dateOfConstruction` (ISO, lokal midnatt 31/12 → t.ex. `1985-12-30T22:00:00Z` = 1985),
`storeysAboveGround` (INT32), `height` (FLOAT64, m), `VTJ_PRT` (byggnadsnummer), `id`.

**Fallgrop:** `_FEATURE_ID_0` är Draco-kvantiserat och kommer som flyttal (t.ex. `516.75`) —
avrunda innan tabelluppslag (`featureData.ts`). Läsning utanför tabellens radantal kastar fel.

## Förbehandlat offline (`pipeline/`, incheckat i `public/cities/helsinki/`)

| Fil | Källa | Skript | Storlek |
| --- | --- | --- | --- |
| `terrain.bin` + `terrain.json` | Terräng 2021, quantized-mesh: `https://kartta.hel.fi/3d/datasource-data/4383570b-33a3-4a9f-ae16-93373aff5ffa/` (zoom 17, 378 tiles) | `npm run pipeline:terrain` | 2 MB (1001×1001 Int16 cm, 2 m rutnät) |
| `water.json` | WFS `avoindata:Maavesi_merialue` + `avoindata:Maavesi_muut_vesialueet` (`https://kartta.hel.fi/ws/geoserver/avoindata/wfs`) | `npm run pipeline:water` | 17 KB (24 polygoner, lokala meter) |

- Havspolygonen via WFS är ~6 MB för hela staden och tar ~7 s → olämplig att hämta i mobilen,
  därför klipps den offline.
- Terrängens höjder är **N2000** (lagrade i ellipsoidhöjdens plats i ECEF, min ≈ 0,6 m vid
  hamnen). Samma konvention gäller 3D Tiles → `y = 0` är havsnivå utan geoidkorrektion.

## Milstolpe 2 — kollektivtrafik (verifierat 2026-11-20)

| Data | Adress | Format | Noteringar |
| --- | --- | --- | --- |
| Realtid (HFP v2) | `wss://mqtt.hsl.fi:443/` | MQTT över WebSocket, JSON `VP` | CC BY 4.0, "HSL". Anslutning ~0,6 s. Hela `tram/#` + bussar i regionen gav ~700 msg/s → appen prenumererar **endast** på topic-geohash-celler (0,01°) som täcker plattan, per läge (`tram`, `bus`, `ferry`): 30 topics, ~175 msg/s. `dl` < 0 = försenad. `route` = GTFS `route_id`. |
| Linjer & hållplatser | `https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip` (87 MB; `http://dev.hsl.fi/gtfs/hsl.zip` → 301 till https) | GTFS | Förbehandlas offline: `npm run pipeline:transit` (`GTFS_DIR` = uppackad zip) → `transit.json` (105 KB): 22 spårvagns-, 85 buss-, 2 färjelinjer (vanligaste formen per riktning, klippt till plattan) och 126 hållplatser. |
| Digitransit API | `api.digitransit.fi` | GraphQL | Kräver API-nyckel → används **inte** (inga nycklar i koden). |

Störningarna i Trafikledare är **fiktiva**; fordonen de påverkar är de verkliga.

## Schematiskt (märkt i UI)

- **Havsbotten:** öppen batymetri saknas i datasetet. Djup = `min(10 m, 1,5 + 0,2 · avstånd till strand)`.
- **Jordlager i sockeln:** fyllning (0,8 m), lös jord 1–8 m (jämn funktion), lera under havet,
  därunder berg ner till −50 m. Ersätts med GTK-data i M4.

## Inte använt ännu

| Data | Status |
| --- | --- |
| Byggnader WFS (`/3d/citydb-wfs/wfs`) | Överbelastad enligt brief — 3D Tiles används. |
| LOD2 texturerad, LOD1, rivna byggnader, träd, broar, mesh 2024 | Ej testade (M3). |
| HSL, digitraffic, FMI, Overpass | M2+ — verifieras innan användning. |
