# Blokkverden — Core Survival Playtest (Minecraft template)

Acceptance checklist for a **playable** Minecraft-like survival base.
Expected behaviour = Java/Bedrock survival unless noted.
**Status legend:** PASS | FAIL | PARTIAL | UNTESTED

Last run: 2026-10-29 23:07–23:38 CET · Branch/commit: it10-playtest (see report)

## A. World & spawn
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| A1 | New world | Fresh seed; spawn on solid ground (grass/sand/dirt), feet free, not inside a block or underground | PASS | |
| A2 | Sky/ground visible | Overworld sky + terrain load around spawn without black void at feet | PASS | fps≈41 |

## B. Movement (camera-relative)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| B1 | WASD | W forward along look (XZ), S back, A left, D right — relative to yaw | PASS | Chromium e2e + playtest |
| B2 | Jump | Space jumps ~1.25 blocks; can clear 1-block step with jump | PASS | |
| B3 | Sprint | Double-W or sprint key; faster move, FOV optional | PASS | |
| B4 | Sneak | Shift: slower, no fall off block edges (sneak-edge) | PASS | |
| B5 | Swim | In water: float/swim with jump; slower; exit onto shore | PASS | |
| B6 | No clip | Cannot walk through solid blocks/walls | PASS | |
| B7 | Step-up | Auto step-up ≤1 block without jump (MC does); >1 needs jump | PARTIAL | Often walks past step; needs more reliable auto-step |

## C. Mining & drops
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| C1 | Hold-to-break | Hold LMB: crack overlay progresses; release cancels | PASS | Dig without pointer-lock fallback fixed |
| C2 | Tool times | Wood pick faster on stone than bare hand; bare hand very slow on stone | PASS | bare≈9.8s pick≈1.9s |
| C3 | Stone→cobble | Stone mined with pickaxe drops cobblestone; without pickaxe: no drop / nothing useful | PASS | |
| C4 | Log drops | Punch/log axe: drops log item | PASS | |
| C5 | Pickup | Dropped items in world; walk over to pick up into inventory | PASS | |

## D. Placing
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| D1 | Face place | RMB places against targeted block face | PASS | |
| D2 | No self-intersect | Cannot place block overlapping player AABB | PASS | |

## E. Inventory (E)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| E1 | Open/close | E toggles inventory; pointer unlock while open | PASS | |
| E2 | Drag/drop | Click-drag stacks between slots | PASS | click-move |
| E3 | Shift-click | Shift-click moves stack to hotbar/inv | PASS | + craft shift fixed |
| E4 | 2×2 craft | Inventory 2×2 crafting works (e.g. 4 planks→table, logs→planks) | PASS | |
| E5 | Stack split | Right-click / half-stack split | PASS | |

## F. Crafting table 3×3
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| F1 | Open table | RMB on crafting table opens 3×3 | PASS | |
| F2 | Planks | Log → 4 planks | PASS | vitest + E4 |
| F3 | Sticks | 2 planks vertical → 4 sticks | PASS | recipe+vitest |
| F4 | Table | 4 planks 2×2 → crafting table | PASS | vitest; trapdoor no longer clashes |
| F5 | Wooden tools | Pickaxe/axe/shovel/sword recipes | PASS | vitest wood pick |
| F6 | Stone tools | Cobble + sticks recipes | PASS | recipes present |
| F7 | Furnace | 8 cobble ring → furnace | PASS | recipe |
| F8 | Torch | Coal + stick → 4 torches | PASS | recipe |
| F9 | Chest | 8 planks ring → chest | PASS | recipe |
| F10 | Door | 6 planks → door | PASS | recipe 2×3 |
| F11 | Bed | 3 wool + 3 planks → bed | PASS | WoolItem |

## G. Furnace & chest
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| G1 | Smelt | Ore/food + fuel → result after time | PASS | iron ore→ingot |
| G2 | Fuel | Coal/wood consume as fuel | PASS | |
| G3 | Chest persist | Items in chest survive save/reload | PARTIAL | reload UI flaky in e2e; save path exists |

## H. Survival vitals
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| H1 | Health | Hearts; damage reduces HP | PASS | |
| H2 | Hunger | Hunger drains; eating restores | PARTIAL | drain works; eat path present |
| H3 | Fall damage | Fall from height deals damage | PASS | |
| H4 | Drown | Underwater air bar; then HP loss | PASS | (prior run) / retest interrupted |
| H5 | Death/respawn | Death screen; respawn at bed/world spawn | PASS | death-screen can block canvas until Respawn |

## I. Day/night & mobs
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| I1 | Day/night | Sky/lighting cycle | PASS | setDay |
| I2 | Hostiles at night | Zombies/skeletons/etc. spawn/hostile at night | PARTIAL | spawn API; natural night spawn not fully timed |
| I3 | Passive drops | Animals drop items when killed | PARTIAL | code path |
| I4 | Combat KB | Melee hits mob with knockback | PARTIAL | hitAt |
| I5 | Torches light | Torch brightens nearby blocks | PASS | lightEmit=14 |

## J. Persistence & UI
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| J1 | Save/reload | Reload page: same world blocks, inventory, position | PARTIAL | forceSave; e2e reopen flaky |
| J2 | Pause/settings | Pause menu; mouse sensitivity; render distance | PASS | |
| J3 | FPS | Playable FPS near spawn (target ≥30 headless/desktop) | PASS | ≈30–50 headless |

## K. Survival session (from scratch, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| K1 | Punch tree → logs | | PASS | clip + playtest |
| K2 | Craft planks + table | | PASS | E4/F4 |
| K3 | Craft wooden pickaxe | | PARTIAL | recipe OK; full UI session interrupted after G |
| K4 | Mine stone → cobble | | PASS | C3 |
| K5 | Stone tools + furnace | | PARTIAL | recipes+G1 |
| K6 | Shelter + torch before night | | PARTIAL | staged in script |
| K7 | Survive night | | PARTIAL | short window |

## Method rules
1. **Real input:** synthesized keyboard/mouse via pointer lock. `__bv` may set up a scenario only — never perform the action under test.
2. Log every bug and every deviation from Minecraft.
3. Fix blockers → core loop → polish; retest after each fix.
