

## it6 — 2026-10-29 (Europe/Oslo)

Priorities: articulated mobs, draw-call metrics, hint toggle, boat waterline, fishing, weather, structures, Byttebonde, map, procedural music.

### Done
- **Mob models**: `createMobRig` articulated heads/limbs + procedural pixel skins/faces; walk/attack limb swing; hurt red emissive flash; death shrink + poof particles. All kinds: gris/ku/sau/høne/vandrer/bueskytt/vever/knallbolle.
- **Perf**: F3 shows `draw`/`tris`; shared materials; sector-merge helper present but **disabled** (rebuild cost tanked headless FPS). Objective metrics (software GL): walk ~37 fps median @ r7, ~90 draw calls, ~128k tris (idle platform). Earlier merge-on: ~20 fps / ~130 draws.
- **Hint**: auto-hide 8s / first look; settings toggle «Vis hint-banner».
- **Boat**: floats at water surface (`surfaceY - 0.12`).
- **Fishing rod** + cast/reel + RawFish/CookedFish furnace.
- **Weather**: rain/snow/thunder by biome + particle overlay + thunder flash/SFX.
- **Structures**: villages (plank houses), ruins, dungeons (MobSpawner + loot chest).
- **Byttebonde** trader NPC + trade UI.
- **Map item** minimap overlay.
- **MusicBus** procedural pentatonic BGM + rain/thunder ambient.

### Shots
`public/progress/it6/` — viewed: 02-mobs-modeller, 03-kamp, 08-bat, 08b-regn, 08c-landsby, 08d-hule, 08e-kart, 08f-byttebonde (+ prior 00–12).

### Notes
- Headless ANGLE software GL — FPS not GPU-representative; use draw/tris as objective.
- Sector merge deferred for next polish pass (incremental merge without full rebuild).

## it7 — 2026-10-29 (Europe/Oslo)

~1h. Hint skjult i ?test=1. Detaljerte skins + idle. Inkrementell sektor-merge. Rødtråd. Byggeklosser. Kreativ. Helvete. Fremskritt.

### Perf walk @r7 headless
- før merge: ~9 fps (kald), draw 83, tris 117k
- etter merge: **34 fps**, draw **49**, tris 144k

### Shots: 01–10 + clip-it7.webm
