# Beslutslogg

## 2026-11-20 — WebGPU-grinden: Milstolpe 1 låses till WebGLRenderer

**Test:** Headless Chromium i molnmiljön (även med `--enable-unsafe-webgpu`) saknar
`navigator.gpu`; endast SwiftShader-WebGL finns. WebGPU kan alltså inte verifieras här.

**API-läget i three r187:** `WebGPURenderer` stöder inte `EffectComposer`/`GTAOPass`/`CSM`
(kräver node-baserade motsvarigheter: `PostProcessing`, `ao()`, `CSMShadowNode`), och
`material.clippingPlanes` ersätts av `ClippingGroup`. 3DTilesRendererJS:s
`setResolutionFromRenderer` är typad mot `WebGLRenderer`.

**Beslut:** `WebGLRenderer` bakom `src/core/renderer.ts`. All renderer-specifik kod (klippning,
skuggor, efterbehandling) ligger i `renderer.ts`, `shadows.ts`, `postprocessing.ts` så att en
WebGPU-väg kan läggas till utan att röra lagren. Testas om på riktig enhet i M5.

## 2026-11-20 — Klippning per material, inte globalt

Kantplanen sätts på varje registrerat material (`ctx.registerMaterial`) med `clipShadows`.
Globala `renderer.clippingPlanes` skulle också klippa sockelns basplatta (som sticker ut 8 m).
GTAO-passets normalmaterial får samma plan så AO inte "ser" klippta byggnader. 3D Tiles
utanför plattan laddas inte alls (`LoadRegionPlugin` med OBB-mask i ECEF).

## 2026-11-20 — Terräng och vatten förbehandlas

Quantized-mesh rastreras offline till ett 2 m höjdgrid; havspolygonen (6 MB) klipps offline.
Ger snabb start på mobil och oberoende av WFS-svarstider. Flygfoto strömmas däremot direkt
(WMS i EPSG:3879, per 250 m-ruta, LOD efter kameraavstånd via prioriterad kö).

## 2026-11-20 — Tonemapping ACES, ingen bloom i M1

AgX gav en urblekt bild mot den ljusa Preetham-himlen; ACES Filmic ger bättre kontrast i
fasadfärgerna. Bloom (UnrealBloomPass) lade en vit slöja över hela scenen p.g.a. HDR-himlen —
avstängd tills nattläget (M3) där fönsterljus behöver den.

## 2026-11-20 — Byggnadsfärger ("Modell"-läge)

Färg per vertex bakas vid laddning från `usage` + `dateOfConstruction` (palett i
`buildingStyle.ts`): förkrigshus ockra/lax/sand, funkis ljust, efterkrig grått/tegel; tak mörk
plåt med inslag av patina och rött. Baksidor som exponeras av kantsnittet ritas i snittfärg.

## 2026-11-20 — Milstolpe 2: Trafikledare som prototyp

Fokus på något spelbart som testar staden, grafiken väntar. Fiktiva störningar (urspårning,
bil på spåret, signalfel) läggs på verkliga huvudlinjer för spårvagn; drabbade linjer och de
**verkliga** HSL-fordonen färgas. Åtgärder: reparationslag (2 st), omdirigering per linje
(−150), ritad ersättningsbuss (−300, halverar förseningen om den passerar inom 90 m).
Poäng = 10 000 + 400/åtgärdad − försenade resenärsminuter − kostnader. 5-minuterspass.
Linjenätet kommer från GTFS offline (Digitransit kräver nyckel). Nattbelysningen fick ett
"månljusgolv" så att spelet går att använda på vinterkvällar innan nattläget (M3).

## 2026-11-20 — Flera städer: Göteborg steg 1

Stadskonfigurationen styr lagren: 3D Tiles (Helsingfors) eller extruderade fotavtryck från
pipelinen (Göteborg); vattenpolygoner eller ett vattenplan som terrängen skymmer; valfri
kollektivtrafik. Projektioner är generaliserade (EPSG:3879/3006/3007). Byte av stad laddar om
sidan (`?city=`) så att motorn startar rent. Höjdgrid-logiken (hålfyllnad, havsbotten,
filformat) delas mellan städerna i `pipeline/heightGrid.ts` — Helsingfors utdata verifierad
byte-identisk efter omstruktureringen. Göteborgs detaljer: `docs/GOTEBORG.md`.
