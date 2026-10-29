# Blokkverden — iterasjonslogg

Original voxel-sandkasse. Ingen Mojang-assets.

## Iterasjon 1 (2026-10-29)

### Bygget
1. Chunket uendelig terreng med seedet støy (sletter, åser, trær, strand/sand, havnivå)
2. Face-culled chunk-meshing med enkel ambient occlusion (budsjettert remesh)
3. Førsteperson med pointer lock: WASD, Space, Shift snike, Ctrl/R sprint
4. AABB-fysikk, kollisjon og tyngdekraft
5. Knusing (hold + progresjon) og plassering med raycast + outline
6. Hotbar 1–9 + scroll (+ touch-tap på slots)
7. Blokksett: gress, jord, stein, brostein, tømmer, planker, løv, sand, glass, vann (placeholder)
8. Dag/natt-himmel med sol og enkel belysning
9. Crosshair + F3-debug (fps, xyz, chunk) + **touch-kontroller** (styrespak, se-dra, hopp/knus/plasser)
10. Lagre/laste verden i IndexedDB (autosave)

### Playtest (headless Chromium, 1280×720)
- ~56 fps ved spawn, 57 chunks lastet
- Gange, hopp, knus og plasser fungerte via `__BV`-API
- Skjermbilder + 2× webm under `public/progress/it1/`

### Bugs funnet
0. ~~Feil atlas-UV (flipY)~~ — fikset før publish
9. Hull / manglende flater ved enkelte vinkler (winding/culling) — midlertidig DoubleSide
1. Y-kollisjon kan gi mikro-float (y ≈ N.00000015) — trenger mer robust snaps
2. Trær klippes på chunk-kanter (løv mangler i nabochunk)
3. Vann er bare en stillestående translucent blokk (ingen strøm/svømming)
4. Meshing på main thread → korte hitch ved chunk-last
5. Knusing er «instant» via API / for rask uten verktøy-forskjell (bare breakTime)
6. Sprint på Ctrl kan kollidere med nettleser-snarveier
7. Ingen fotspor/lyder — verden føles stille
8. Glass/løv-sortering: transparent depth ikke perfekt

### Plan iterasjon 2 (~10)
1. fix: robust Y-snap / stepping (ikke sveve eller falle gjennom)
2. fix: trær genereres over chunk-grenser
3. feat: inventar-UI (E) med 36 slots + hotbar-kobling
4. feat: crafting 2×2 i inventar + oppskrifter (planker, crafting table)
5. feat: crafting table 3×3
6. feat: verktøy (tre-hakke/-øks/-spade/-sverd) med hardhet/mining speed
7. feat: droppete gjenstander i verden + plukk opp
8. feat: helse + hunger (enkle hjerter/kjøtt)
9. feat: fakkel + enkel lyspropagasjon i chunk
10. feat: flere biomer (skog, ørken, snø) + underjordisk stein/malm-start

Media: https://thomasaitest.github.io/blokkverden/progress/it1/
