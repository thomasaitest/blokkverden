# Blokkverden — Core Survival Playtest (Minecraft template)

Acceptance checklist for a **playable** Minecraft-like survival base.
Expected behaviour = Java/Bedrock survival unless noted.
**Status legend:** PASS | FAIL | PARTIAL | UNTESTED

Last run: 2026-10-31 02:26–02:35 CET · it18 core (56 PASS / 0 FAIL) + scripts/it18-verify.ts + scripts/it18-explore.ts (section P)

## A. World & spawn
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| A1 | New world | Fresh seed; spawn on solid ground (grass/sand/dirt), feet free, not inside a block or underground | PASS |  it11 e2e |
| A2 | Sky/ground visible | Overworld sky + terrain load around spawn without black void at feet | PASS | fps≈41  it11 e2e |

## B. Movement (camera-relative)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| B1 | WASD | W forward along look (XZ), S back, A left, D right — relative to yaw | PASS | Chromium e2e + playtest  it11 e2e |
| B2 | Jump | Space jumps ~1.25 blocks; can clear 1-block step with jump | PASS |  it11 e2e |
| B3 | Sprint | Double-W or sprint key; faster move, FOV optional | PASS |  it11 e2e |
| B4 | Sneak | Shift: slower, no fall off block edges (sneak-edge) | PASS |  it11 e2e |
| B5 | Swim | In water: float/swim with jump; slower; exit onto shore | PASS |  it11 e2e |
| B6 | No clip | Cannot walk through solid blocks/walls | PASS |  it11 e2e |
| B7 | Step-up | Auto step-up ≤1 block without jump (MC does); >1 needs jump | PASS | foothold step-up; unit+e2e  it11 e2e |

## C. Mining & drops
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| C1 | Hold-to-break | Hold LMB: crack overlay progresses; release cancels | PASS | Dig without pointer-lock fallback fixed  it11 e2e |
| C2 | Tool times | Wood pick faster on stone than bare hand; bare hand very slow on stone | PASS | bare≈9.8s pick≈1.9s  it11 e2e |
| C3 | Stone→cobble | Stone mined with pickaxe drops cobblestone; without pickaxe: no drop / nothing useful | PASS | it14: also cobble/furnace need a pickaxe; tiers in L2 |
| C4 | Log drops | Punch/log axe: drops log item | PASS |  it11 e2e |
| C5 | Pickup | Dropped items in world; walk over to pick up into inventory | PASS |  it11 e2e |

## D. Placing
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| D1 | Face place | RMB places against targeted block face | PASS |  it11 e2e |
| D2 | No self-intersect | Cannot place block overlapping player AABB | PASS |  it11 e2e |

## E. Inventory (E)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| E1 | Open/close | E toggles inventory; pointer unlock while open | PASS |  it11 e2e |
| E2 | Drag/drop | Click-drag stacks between slots | PASS | click-move  it11 e2e |
| E3 | Shift-click | Shift-click moves stack to hotbar/inv | PASS | + craft shift fixed  it11 e2e |
| E4 | 2×2 craft | Inventory 2×2 crafting works (e.g. 4 planks→table, logs→planks) | PASS |  it11 e2e |
| E5 | Stack split | Right-click / half-stack split | PASS |  it11 e2e |

## F. Crafting table 3×3
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| F1 | Open table | RMB on crafting table opens 3×3 | PASS |  it11 e2e |
| F2 | Planks | Log → 4 planks | PASS | vitest + E4  it11 e2e |
| F3 | Sticks | 2 planks vertical → 4 sticks | PASS | recipe+vitest  it11 e2e |
| F4 | Table | 4 planks 2×2 → crafting table | PASS | vitest; trapdoor no longer clashes  it11 e2e |
| F5 | Wooden tools | Pickaxe/axe/shovel/sword recipes | PASS | vitest wood pick  it11 e2e |
| F6 | Stone tools | Cobble + sticks recipes | PASS | recipes present  it11 e2e |
| F7 | Furnace | 8 cobble ring → furnace | PASS | recipe  it11 e2e |
| F8 | Torch | Coal + stick → 4 torches | PASS | recipe  it11 e2e |
| F9 | Chest | 8 planks ring → chest | PASS | recipe  it11 e2e |
| F10 | Door | 6 planks → door | PASS | recipe 2×3  it11 e2e |
| F11 | Bed | 3 wool + 3 planks → bed | PASS | WoolItem  it11 e2e |

## G. Furnace & chest
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| G1 | Smelt | Ore/food + fuel → result after time | PASS | iron ore→ingot  it11 e2e |
| G2 | Fuel | Coal/wood consume as fuel | PASS |  it11 e2e |
| G3 | Chest persist | Items in chest survive save/reload | PASS | forceSave await + title show reset; e2e  it11 e2e |

## H. Survival vitals
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| H1 | Health | Hearts; damage reduces HP | PASS |  it11 e2e |
| H2 | Hunger | Hunger drains; eating restores | PASS | eat without hit; e2e apple restores  it11 e2e |
| H3 | Fall damage | Fall from height deals damage | PASS |  it11 e2e |
| H4 | Drown | Underwater air bar; then HP loss | PASS | (prior run) / retest interrupted  it11 e2e |
| H5 | Death/respawn | Death screen; respawn at bed/world spawn | PASS | death-screen can block canvas until Respawn  it11 e2e |

## I. Day/night & mobs
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| I1 | Day/night | Sky/lighting cycle | PASS | setDay  it11 e2e |
| I2 | Hostiles at night | Zombies/skeletons/etc. spawn/hostile at night | PASS | night uses block light; natural spawn e2e  it11 e2e |
| I3 | Passive drops | Animals drop items when killed | PASS | gris→kjøtt e2e  it11 e2e |
| I4 | Combat KB | Melee hits mob with knockback | PASS | knockBack timer preserves impulse; e2e  it11 e2e |
| I5 | Torches light | Torch brightens nearby blocks | PASS | lightEmit=14  it11 e2e |

## J. Persistence & UI
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| J1 | Save/reload | Reload page: same world blocks, inventory, position | PASS | chest+inv+pos after reopen e2e  it11 e2e |
| J2 | Pause/settings | Pause menu; mouse sensitivity; render distance | PASS |  it11 e2e |
| J3 | FPS | Playable FPS near spawn (target ≥30 headless/desktop) | PASS | ≈30–50 headless  it11 e2e |

## K. Survival session (from scratch, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| K1 | Punch tree → logs | | PASS | clip + playtest  it11 e2e |
| K2 | Craft planks + table | | PASS | E4/F4  it11 e2e |
| K3 | Craft wooden pickaxe | | PASS | survival session e2e  it11 e2e |
| K4 | Mine stone → cobble | | PASS | C3  it11 e2e |
| K5 | Stone tools + furnace | | PASS | survival session e2e  it11 e2e |
| K6 | Shelter + torch before night | | PASS | shelter+torch e2e  it11 e2e |
| K7 | Survive night | | PASS | survived night in shelter e2e  it11 e2e |

## L. Deeper survival (it14, `scripts/it14-verify.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| L1 | Mine straight down | Bedrock floor at y=0, unbreakable; you land on it | PASS | V1 |
| L2 | Pickaxe tiers | Iron ore needs stone+, gold/diamond need iron+; weaker pick = slow + no drop | PASS | V2 |
| L3 | Iron chain | Smelt 3 iron ore (furnace UI) → craft iron pickaxe on table | PASS | V3 |
| L4 | Cook meat | Raw meat → cooked meat in furnace; eat (+8) | PASS | V4 |
| L5 | Break chest | Contents spill as items | PASS | V5 |
| L6 | Sunrise | Zombies/skeletons in open sky burn; roofed/creepers don't | PASS | V6 |
| L7 | Creeper | Hissing creeper stands still, no melee; fuse winds down if you run >7 | PASS | V7 |
| L8 | Held item name | Name above hotbar ~2 s on switch; F3 debug off by default | PASS | V8 |
| L9 | Pickup → hotbar | Picked-up item shows in hotbar at once | PASS | V9 |
| L10 | Tool icons | Pickaxe/axe/shovel/sword/hoe/armor distinguishable, per tier | PASS | V10 |
| L11 | Torches | Torch placeable in own cell (1×1 shaft); pops off when its block is mined | PASS | V11 |

## M. Explosions, mob loot, string (it15, `scripts/it15-verify.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| M1 | Creeper blast | Walk up → hiss → one explosion: crater in grass *and* stone, chest in range spills contents, torches pop, damage by distance/cover (survivable at ~4 blocks) | PASS | X1 + vitest (explodes exactly once) |
| M2 | Hostile loot | Zombie → rotten flesh, spider → string, creeper (killed) → gunpowder; exploded creeper drops nothing; never coal | PASS | X2 (real sword clicks) |
| M3 | Rotten flesh | Hold RMB: +4 hunger; 80 % Hunger effect → green hunger bar, drains faster for 30 s | PASS | X3 |
| M4 | String recipes | Bow = 3 sticks + 3 string (table); 4 string → wool (2×2); fishing rod uses string | PASS | X4 + vitest |
| M5 | Creeper look | Four legs, no arms, face only on the head | PASS | screenshot it15-00 |
| M7 | Cave spawns | Dark roofed spaces (sky+torch light < 8) spawn hostiles day and night, 16–28 blocks away; a torch-lit hall stays empty | PASS | X6 + vitest |
| M8 | No canopy spawns | Nothing spawns on leaves (was: skeletons on tree tops) | PASS | vitest |
| M6 | Real combat in core run | I3/I4 now use real LMB clicks (were faked with `__bv.mobs.hitAt`) | PASS | core-playtest I3/I4 |

## N. Gravity, leaves, light (it16, `scripts/it16-verify.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| N1 | Sand falls | Break the block under a sand column (LMB) → whole column drops; sand placed (RMB) against a floating block falls to the ground (through water; breaks into an item on a torch) | PASS | S1, S2 + vitest |
| N2 | Buried by sand | Dig dirt with 2 sand above you → sand fills feet+head cells; you are stuck, see the sand texture, take 1 ♥/2 every 0.5 s; dig the head block out (LMB) → stand on the lower sand, no more damage | PASS | S3 + vitest (was: lifted up through the sand, x-ray view) |
| N3 | Leaf decay | Chop all logs of a tree (axe, LMB) → its leaves vanish gradually over ~2–20 s (not instantly); leaves still within 6 of another log stay | PASS | L1 + vitest |
| N4 | Placed leaves | Leaves placed by the player never decay | PASS | L2 + vitest |
| N5 | Leaf drops | Apple 0.5 %, 1–2 sticks 2 % (was apple 8 %, stick 10 %) | PASS | vitest (40 000 samples) |
| N7 | Structures | Villages/ruins/dungeons exist as soon as their chunk is generated (not stamped next to / around the player when first approached) | PASS | core B3 (was trapped in a house wall stamped onto the test pad) |
| N8 | Dark caves | Light 0 is near-black; torch-lit areas stay bright | PASS | X6 screenshot + vitest light curve |
| N6 | Daylight | Noon: blocks show full texture colour, sides shaded only by MC face shading (not ~half-dark); night stays dark | PASS | it16-00a/00c screenshots |

## O. Plants, gravel, targeting (it17, `scripts/it17-verify.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| O1 | Tall grass | Tufts generate on grass (plains/forest, not snow/desert); X-shaped, no collision; LMB breaks instantly; 12.5 % seeds | PASS | N0, P1 + vitest |
| O2 | Replaceable | RMB with a block aimed at tall grass places into that cell (not on top) | PASS | P2 |
| O3 | Grass block drop | Breaking a grass block always gives dirt (was: 12 % seeds *instead* of dirt) | PASS | vitest |
| O4 | Targeting small blocks | Torches, crops, plants, ladders, red dust can be aimed at and broken with LMB (was: ray went through them since it1 — torches couldn't be removed) | PASS | P3, P4a |
| O5 | Pop off | Breaking the block under a crop/sapling/tall grass/torch pops it as an item (crop: wheat+seeds if ripe) | PASS | P4b |
| O6 | Gravel | Falls like sand; 10 % flint, else gravel; generated in stone blobs and ocean floors | PASS | G1, G2 + vitest |
| O7 | Sapling | Leaves drop a sapling 5 %; RMB plants only on grass/dirt/farmland; no collision; grows into an oak (needs light ≥ 9 and room; grass under it turns to dirt) | PASS | S1–S3 + vitest |
| O8 | Leaf decay saved | Chop a tree, save & quit at once, reload → the leaves still decay | PASS | L3 + vitest |
| O10 | Arrow recipe | Flint + stick + feather (vertical) → 4 arrows (was cobble) | PASS | core F12 + vitest |
| O9 | Jump tap | A quick Space tap (even shorter than a frame / just before landing) jumps | PASS | J 5/5, core B2 |

## P. Bone meal, flowers, ladders, doors (it18, `scripts/it18-verify.ts` + `scripts/it18-explore.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| P1 | Bone meal recipe | 1 bone → 3 bone meal (2×2 grid) | PASS | BM0 + vitest |
| P2 | Bone meal on crop | RMB: +2–5 growth stages, one used; ripe crop: nothing used | PASS | BM1 + vitest |
| P3 | Bone meal on sapling | RMB: 45 % chance to grow the oak at once; used up every time | PASS | BM2 + vitest |
| P4 | Bone meal on grass | RMB on a grass block: tall grass (some flowers) spreads within 3 blocks | PASS | BM3 + vitest |
| P5 | Flowers | Dandelions/poppies generate on grass; X-model, no collision, break instantly, drop themselves; plant only on grass/dirt | PASS | FL1, FL2, X3 + vitest |
| P6 | Water washes | Flowing water breaks torches, red dust, crops, saplings, tall grass, flowers into items | PASS | W1 + vitest |
| P7 | Break particles | Particles take the block's texture colour (was always brown) | PASS | PC1 screenshot + vitest |
| P8 | Ladders | W into a ladder climbs (no Space needed, ~2.35 b/s); Shift holds; idle slides down ≤ 3 b/s; climb out on top; no fall damage | PASS | X6 + vitest (was: Space only, Shift dropped you fast) |
| P9 | Doors (2 tall) | Placing needs 2 free cells + floor; upper half targetable (RMB opens/closes, also with a block in hand) and can't be built into; faces the placer; pops when the floor goes; blocks water | PASS | X7 + vitest (was: upper half was air — clicks went through, blocks could be placed into the door) |
| P10 | Mining penalties | ×5 slower with eyes under water, ×5 while airborne | PASS | X11 + vitest |
| P11 | Movement basics | Pillar-jump (Space+RMB down), sneak-bridging, dig straight down, mine the ceiling and jump, water landing (no fall damage), Q drop + pickup, sleep at night | PASS | X1, X2, X4, X5, X8, X9, X10 |

## Q. Fire, flint and steel, lava, thin doors (it19, `scripts/it19-verify.ts`, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| Q1 | Flint and steel recipe | Iron ingot + flint (any arrangement) → flint and steel (64 uses) | PASS | FS0 + vitest |
| Q2 | Lighting fire | RMB with flint and steel on a block face → fire in front (needs solid floor or something flammable next to it); 1 use; light 15; no collision; LMB puts it out, drops nothing | PASS | FS1 + vitest |
| Q3 | Fire burns out / spreads | On stone it burns out after a few seconds; on helstein it burns forever; wood, leaves, wool, plants catch fire and burn away; water puts it out | PASS | FS1, FS2 + vitest |
| Q4 | Burning | Standing in fire 1 dmg / 0.5 s, then burning 1 dmg/s for 8 s (flames over the screen); water puts it out | PASS | FS3 + vitest |
| Q5 | Portal | Flint and steel on a complete portal frame lights it (1 use) | PASS | FS4 |
| Q6 | Lava | Slow (~1 b/s), breaks a fall, 4 dmg / 0.5 s, keeps burning 15 s after leaving | PASS | L1 + vitest (was: lava did nothing — no damage, fell through it like air) |
| Q7 | Doors (thin) | A closed door collides only as a 3/16 panel on its edge (2 tall); open: panel against the hinge side, walk through | PASS | D1 + vitest (was: full block) |

## Method rules
1. **Real input:** synthesized keyboard/mouse via pointer lock. `__bv` may set up a scenario only — never perform the action under test.
2. Log every bug and every deviation from Minecraft.
3. Fix blockers → core loop → polish; retest after each fix.
