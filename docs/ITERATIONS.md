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

## Iterasjon 2 (2026-10-29)

### Bygget
1. fix: robust Y-snap + step-up (~1 blokk) og fallskade
2. fix: trær over chunk-grenser (pending decorations + setAbs)
3. fix: face-culling med FrontSide (fjernet DoubleSide); separat opaque/transparent mesh
4. Transparent depthWrite=false for vann/glass/løv
5. Inventar (E) med dra/slipp, 36 slots + hotbar
6. Crafting 2×2 i inventar
7. Arbeidsbenk 3×3 (høyreklikk) med oppskrifter (planker, pinner, benk, tre-/steinverktøy)
8. Tre-/steinverktøy med mining speed + durability
9. Item-drops i verden + plukk opp
10. Helse/hunger-HUD + fallskade; sprint via dobbel-W (Ctrl som alt)

### Playtest
- ~56 fps, 66 chunks; inventar/arbeidsbenk/drops OK
- Media: `public/progress/it2/`

### Bugs funnet
1. Inventar-FPS dropper mens overlay er åpent (DOM re-render)
2. Crafting-UI støtter ikke «shift-klikk» / oppskriftsbok
3. Drops er fargede kuber (ikke item-billboards med atlas)
4. Vann mangler fortsatt strøm/svømming
5. Hunger synker litt raskt ved sprint
6. Meshing fortsatt på main thread
7. Ingen lyd
8. Arbeidsbenk åpnes via API i playtest — høyreklikk-mål kan miss’e hvis man holder blokk

### Plan iterasjon 3 (~10)
1. feat: fakkel + lyspropagasjon
2. feat: biomer (skog, ørken, snø) + malm (kull/jern)
3. feat: ovn (furnace) med smelting
4. feat: kiste med lagring
5. feat: vannstrøm + svømming
6. feat: enkle mobs (gris/ku) + drops mat
7. feat: spise mat for hunger
8. feat: bedre drop-rendering (atlas-sprites)
9. feat: oppskriftsbok / shift-craft
10. fix: meshing i worker + mindre hitch

Media: https://thomasaitest.github.io/blokkverden/progress/it2/

## Iterasjon 3 (2026-10-29)

### Bygget
1. Chunk-meshing i Web Worker (+ synk-fallback)
2. Fakkel + sky-/blokkllys (flood fill per chunk)
3. Biomer (ocean, beach, plains, forest, desert, snow) + huler + malm (kull/jern/gull/diamant)
4. Ovn med smelting + drivstoff
5. Kiste med 27 slots (lagret)
6. Rennende vann + svømming/drukning (luftbobler)
7. Spise mat (eple fra løv, bakt eple)
8. Tregere hunger
9. Drops som boblende/roterende mini-kuber
10. Shift-klikk + oppskriftsbok; worker reduserer inventar-hitch

### Playtest
- ~38 fps, 74 chunks, tørr spawn, fakkel om natten, ovn/oppskrifter OK
- Media: `public/progress/it3/`

### Bugs funnet
1. Lys propagerer ikke godt over chunk-grenser (kun kant-seed)
2. Vannfylling kan være treg / flommer flatt
3. Drops bruker tintet atlas, ikke perfekte per-face UV
4. Oppskriftsbok er kun liste (ikke klikk-for-å-plassere mønster)
5. Ovn-UI refreshes hvert 200ms (lite flimring)
6. FPS fortsatt ~35–45 i dense chunks
7. Ingen lyd / mobs ennå
8. Diamant/jern-verktøy mangler (bare tre/stein)

### Plan iterasjon 4 (~10)
1. feat: jern-/diamantverktøy + rustning start
2. feat: enkle mobs (ku/gris/zombie om natten)
3. feat: senger / respawn
4. feat: bedre lys over chunk-grenser
5. feat: lyd (steg, knus, vann, ovn)
6. feat: bue / kamp
7. feat: mer biomer-detalj (kaktus, snølag)
8. feat: kart-item
9. fix: vannnivå-rendering (delvis blokk)
10. feat: achievements / første hub-lenke

Media: https://thomasaitest.github.io/blokkverden/progress/it3/

## Iterasjon 4 — ytelse, lys, lyd, mobber, kamp, seng, vannnivå

**FPS:** før ~38 (it3, radius 4) → etter walk ~56 (radius 6, ~147 chunks). Mål 60@6–8 delvis nådd; ytterligere atlas/frustum-finpuss står.

### Levert
- Ytelse: VIEW_RADIUS 6, delt atlas/materiale, meshesDirty + meshRevision, remesh/lys-budsjett, pixelRatio=1, fog nærmere
- Lys over chunk-grenser (flood til lastede naboer)
- WebAudio SoundBus: steg per materiale, break/place, hurt, eat, ambient
- Passive: gris, ku, sau, høne (+ drops); fiender natt: vandrer, bueskytt, vever, knallbolle (eksplosiv, original)
- Kamp: melee, knockback, krits; bue/piler; rustning reduserer skade
- Jern-/diamantverktøy + rustningsplasser
- Seng: søvn hopper natt + respawn; dødsskjerm + respawn
- Vannmesh med waterLevel (flate/flow)
- Save v4 (respawn, armor)

### Media
`public/progress/it4/` — 01-spawn … 06-respawn, clip-mobs-kamp.webm, clip-utforsk-seng.webm

### Tester
22 vitest grønne; Playwright headless playtest
