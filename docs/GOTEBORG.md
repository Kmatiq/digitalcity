# Göteborg — etapplan

Samma Stadsplatta som Helsingfors (2 × 2 km, 50 m djup, startmeny, Utforska, spel) men på
svensk öppen data. Datakällor och licenser: `cities/goteborg/DATA.md`.

| Steg | Innehåll | Data | Status |
| --- | --- | --- | --- |
| **1. Plattan står** | Stadskonfiguration, flerstadsstöd (stadsväljare i menyn), terräng 0,5 m→2 m, vatten ur höjdmodellen, ortofoto 2025 (strömmat), LOD1-byggnader ur baskartans takkonturer, sockel med genomskuren älv, klick på byggnad (höjd/våningar), källhänvisning | Göteborgs Stad (CC0) | **Klart** |
| 2. Kompletta byggnader & adresser | Lantmäteriets fotavtryck + ändamål fyller luckorna; adresser i klickkortet; vattenpolygoner ur marktäcke; ev. LOD1,5/2-tak från konturernas höjder | Lantmäteriet (CC BY 4.0, kräver Geotorget-konto) | Väntar på konto |
| 3. Kollektivtrafik & Trafikledare | Västtrafik GTFS (linjer, hållplatser) offline; realtidspositioner (GTFS-RT VehiclePositions) via ett litet relä så att ingen nyckel hamnar i klienten; Trafikledare-spelet återanvänds | Trafiklab / Västtrafik (kräver API-nyckel) | Väntar på nyckel + beslut om relä |
| 4. Detaljer | Träd (baskartan `markdetaljer`), gatumiljö, broar, historiska ortofoton 2015–2023 (Tidsresenären) | Göteborgs Stad (CC0), ev. OSM (ODbL) | — |
| 5. Under mark | Götatunneln, Västlänken (under byggnad), jorddjup/lera (SGU) | SGU, Trafikverket, OSM | — |

## Beslut i steg 1

- Stadens egen CC0-data går före Lantmäteriet: den kräver inget konto och är mer detaljerad
  (0,5 m höjdmodell, fotogrammetriska 3D-linjer).
- Byggnader som **LOD1-block** med platt tak på medianhöjden av takkonturen. Konturerna
  blandar takfot- och gavelhöjder; triangulerade lutande tak blev taggiga.
- Vattnet härleds ur höjdmodellen (vattenytorna ligger på ≈ −0,3–0,2 m RH2000) eftersom
  baskartans hydrografi bara finns som linjer/punkter.
