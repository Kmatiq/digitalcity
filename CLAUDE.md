# Stadsplattan — arbetsregler

3D-diorama av en verklig stad (Helsingfors och Göteborg, 2×2 km, 50 m djup) i webbläsaren.
Fullständig brief: `docs/BRIEF.md`. Beslut: `docs/DECISIONS.md`. Göteborgs etapper: `docs/GOTEBORG.md`.
Datakällor: `cities/<stad>/DATA.md`. Välj stad med `?city=helsinki|goteborg` (eller i menyn).

## Kommandon

- `npm run dev` — Vite på :5173 · `npm run build` — typecheck + bygge (`BASE_PATH` styr base, default `/digitalcity/`)
- `npm run typecheck` · `npm run lint` · `npm test` (vitest) · `npx prettier --write .`
- `npm run pipeline:water` → sedan `npm run pipeline:terrain` (vattnet behövs för havsbotten)
- `GTFS_DIR=/path/hsl npm run pipeline:transit` (uppackad HSL GTFS)
- Göteborg: `CITY=goteborg npm run pipeline:terrain-wcs` → sedan
  `BASKARTA_DIR=/path/baskarta_shp CITY=goteborg npm run pipeline:buildings-gbg` (behöver terrain.bin)
- `NODE_PATH=$(npm root -g) node scripts/play-transit.mjs --view=desktop|fold-closed|fold-open` — E2E för Trafikledare
- `NODE_PATH=$(npm root -g) node scripts/screenshots.mjs [--only=desktop,fold-closed,fold-open] [--scenes=menu,explore,pick,edge] [--q=quality=medium] [--inspect]`

## Arkitektur

- `src/core/` motor: `engine.ts` (loop, kvalitet, dynamisk upplösning), `coordinates.ts`
  (**enda** stället för koordinatkonvertering), `renderer.ts` (renderer-fabrik, WebGL i M1),
  `environment.ts` (sol/himmel/IBL), `shadows.ts`, `postprocessing.ts`, `controls.ts`,
  `fetchQueue.ts` (prioriterad kö med timeout + AbortSignal), `store.ts` (UI-tillstånd), `testHooks.ts`.
- `src/layers/<lager>/` implementerar `Layer` (`types.ts`). Registrera **alla** belysta material
  via `ctx.registerMaterial(m)` (klipplan + CSM). `{ clip: false }` endast för sockeln.
- `src/modes/` `AppModeController` + `ModeManager`; spellägen får inte röra lagren direkt utöver overlays
  (t.ex. `TransitLayer.tintOf`, `NetworkLines.highlight`). Trafikledare: `modes/transit/` —
  `gameLogic.ts` är ren och enhetstestad, `gameVisuals.ts` 3D, `transitGame.ts` styrning; UI i `ui/game/`.
- HSL-realtid: prenumerera aldrig på hela `/hfp/v2/journey/#` — bara plattans geohash-celler (`hfpClient.ts`).
- `src/ui/` tunt React-lager ovanpå 100 % canvas. `src/cities/<stad>.json` stadskonfiguration:
  `buildings.type` = `3dtiles` (Helsingfors) | `extruded` (Göteborg), vatten utan `file` = plan
  som marken skymmer, `transit` valfri (saknas → Trafikledare låst). Ortofoto-WMS i stadens CRS.
- `pipeline/` offline-förbehandling (Node/tsx) → `public/cities/<stad>/`.

## Koordinater (icke förhandlingsbart)

Lokala meter, origo i plattans mitt vid havsnivå: **+X öst, +Y upp, −Z norr (+Z syd)**.
ENU-tangentplan → 3D Tiles mappas med en matris (`ecefToLocalMatrix`). Höjder = stadens system
(Helsingfors N2000, lagrat i ECEF:s höjdfält; Göteborg RH2000). Projektioner: EPSG:3879, 3006,
3007 (`localToProjected`/`projectedToLocal`). WMS 1.1.1 ⇒ x,y-ordning.

## Regler

- Små moduler (ESLint varnar > 350 rader), inga hoptryckta rader, ingen variabelskuggning.
- Genomskinliga material: `depthWrite: false`. Inget procedurbrus på stadsterräng.
- Schematiska lager: `isSchematic: true` + märkning i UI. Källhänvisning alltid synlig.
- Inga nycklar/hemligheter i appen. Kontouppgifter (t.ex. Lantmäteriet) endast i offline-pipelinen
  via miljöns nätverkshemligheter. Mobil först (Galaxy Fold stängd ~360 px, uppvikt ~720 px).
- Ändra aldrig källkod medan ett skärmdumpstest kör. Molnwebbläsaren kör SwiftShader (~1 FPS) —
  FPS där säger inget; 3D Tiles-parsning tar minuter där.
- Draco feature-id är flyttal → avrunda. Läs aldrig utanför property-tabellen.

## Testkrokar (`window.__stadsplattan`)

`setCamera(pos, target)`, `setTime(iso|null)`, `setQuality(level)`, `setAppMode(mode)`,
`setLayerVisible(id, v)`, `getStats()` (fps, frameMs, drawCalls, triangles, loading, layers),
`pickAt(x, y)`, `capture()`, `ready()`. URL: `?headless&mode=explore|transit_game&quality=high&time=ISO`
(`?noao` för felsökning).

## Definition of Done (Milstolpe 1)

typecheck + build utan fel · 0 konsolfel · startmeny med Utforska + låsta spellägen · exakt
2000×2000 m med skarpa kanter · byggnader rätt skala/väderstreck, på marken · flygfoto linjerar
med fotavtryck, hamnvatten genomskuret i kanten · tryck på byggnad visar adress/byggår/våningar ·
kvalitet low–ultra, FPS/ms, versionsstämpel, "Helsingin kaupunki (CC BY 4.0)" synliga · verifierat
i datorvy och Fold stängd/uppvikt · **testat på riktig enhet** innan något räknas som klart.
