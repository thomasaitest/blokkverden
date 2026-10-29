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

## Iterasjon 5 — ytelse, playtest-hooks, XP, jordbruk, båt, verdener, UI

**FPS:** før ~38 (it4 walk r6) → etter walk **~38** ved radius 7 (~178 chunks) i headless Chromium. State ~33. Mål 60@7–8 delvis: frustum/LOD for transparent, versioned mesh-sync, færre per-frame allocs, vann-tick tøyler; headless GL underdriver vs ekte GPU. Innstilling for renderavstand 3–10.

### Playtest-kvalitet
- `?test=1` → fersk verden + `window.__bv` (teleport, setTime, spawnMob, give, lookAt, waitForMeshes, buildPlatform, …)
- Staged scener; alle PNG visuelt sjekket. Fix: FP-armor-mesh dekket hele view (slått av; HUD-slots viser rustning).

### Levert
- Ytelse: VIEW_RADIUS 7 (justerbar), transparent LOD, versioned syncChunks, water tick sjeldnere, fog tilpasset
- Bedre mob-pathing (step-up 1, unngå vann/stup), multi-del mob-mesh + bob
- XP-orbs + nivå + fortryllelsesbord (enkel enchant)
- Jordbruk: hoe, åkerjord, avling/vekst, brød; frø
- Båter (plasser + mount)
- Verdenvelger (flere lagre v5) + tittelskjerm + pause/innstillinger (renderavstand, FOV, sens, volum)
- Touch: sneak/E/pause-knapper
- Bevegelse nærmere klassisk (walk 4.317 / sprint 5.612 / hopp)
- Save v5 multi-world; daglengde 900s

### Media
`public/progress/it5/` — 00-tittel … 12-respawn, clip-mobs-kamp.webm, clip-farm-bat-seng.webm

### Tester
22 vitest grønne


## Iterasjon 8 (2026-10-29) — kvalitet, greedy mesh, rødtråd, seng, lagring

**Tid:** start 20:14 CET → slutt 21:09 CET (~55+ min). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. `buildPlatform` hadde feilaktig Helvete-portal-kode inni seg — fjernet
2. Helvete-transit overskrev overworld-chunks — deaktivert (portal kun visuell)
3. Portal-ramme matchet ikke lighting → 0 portalblokker — ny 4×5 `buildPortalFrame`
4. `setWater`/`chunk.set` slettet meta på spak/dør — ny `setMeta`
5. Bevegelse speilvendt mot kamera/raycast — fikset wish→world
6. `give()` valgte ikke hotbar-item — select/swap
7. Atlas-ikon-UV feil etter utvidet atlas — fikset ATLAS_W/H

### Nye features (verifisert)
1. Greedy meshing (enhetstest flat pute <80 tris)
2. Synlig rødtråd (glow-tile + partikler; lampe lyser når powered)
3. Seng: søvn hopper natt + respawn
4. Verdenlagring: rename + slett med bekreftelse

### Perf walk @r7 headless
- merge av: ~40 fps, draw 97, tris ~48k
- merge på: ~58 fps, draw 57, tris ~55k

### Media
`public/progress/it8/`

### Tester
29 vitest grønne

## Iterasjon 9 (2026-10-29) — kvalitet, båt/fiske/dør/lampe, Helvete-dimensjon

**Tid:** start 21:12:58 CET → slutt 22:08 CET (~56 min + CI). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. Båt: mount-avstand for stor + styring — mount innen rekkevidde, vannlinje-visning, sneak-avstigning
2. Fiske: bite/reel upålitelig — 8s bite-vindu, alltid RawFish ved bite; castFish tvinger IKKE lenger; naturlig bite 3/3 wall-clock + 5/5 verify
3. Dør: gjennomsiktig hull — egen svingbar mesh (ikke greedy), opaque, lukket/åpen skudd
4. Lampe: lite synlig «på» — hoppet over greedy mesh, BasicMaterial mørk/av vs lys/på + PointLight, natt-par
5. Helvete: overworld-korrupsjon (it8) — separat chunk-store per dimensjon, round-trip-test

### Nye features (verifisert)
1. Helvete som egen dimensjon/chunk-store (Helstein, Sjelegrus, lava, rød himmel) — portal begge veier; OW urørt etter retur (unit + playtest)
2. 3D-skilttekst (canvas på stolpe) — «Hei / Blokk» verifisert

### Verifisert fungerer
- Båt mount / styre / dismount + vannlinje
- Fiske: naturlig bite (uten forceInstantBite) 3/3 wall-clock + 5/5 i verify
- Dør mesh lukket/åpen (ikke transparent)
- Lampe av (mørk) vs på (emissiv + glow) natt-par
- it8-regresjon: portal 6 indre, give velger hotbar, seng, build
- Helvete round-trip + peekBlock OW-integritet
- 3D-skilt

### Media
`public/progress/it9/` (+ webm)

### Tester
31 vitest grønne (inkl. helvete-dim dual-store)

Media: https://thomasaitest.github.io/blokkverden/progress/it9/

## Iterasjon 10 (2026-10-29) — dør-gap, Helvete-himmel/lava, portal, ulv

**Tid:** start 22:09:55 CET → slutt ~23:10 CET (~60 min). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. Dør åpen: terskel-gap (sky) — sill + 2-blokk flush panel
2. Helvete-himmel blek/hvit — `setDayTime` hvert frame overskrev dim-vis; nå `applyHelveteSky` (rød/mørk)
3. Helvete: få lava nær spawn — lavere terrengbaseline + lavaTop 28; synlig Glødstein-klynger
4. Portal-foto: isolert klar 4×5 tent ramme (6 portal + 14 frame)
5. Ulv-temming: rekkevidde/approach før bone-interact

### Nye features (verifisert)
1. Ulv (`ulv`): temmes med Bein, følger spiller, sitt/stå-toggle

### Verifisert fungerer
- Dør lukket/åpen uten terskel-hull
- Helvete rød himmel/fog (ikke blek)
- Lava-sjøer + glødstein i Helvete
- Portal full tent ramme
- Round-trip OW urørt
- Båt, fiske naturlig 3/3, lampe av/på, skilt, seng
- Ulv tame/follow/sit

### Media
`public/progress/it10/` (+ webm)

### Tester
31 vitest grønne

Media: https://thomasaitest.github.io/blokkverden/progress/it10/
