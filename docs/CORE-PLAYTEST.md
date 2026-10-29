# Blokkverden — Core Survival Playtest (Minecraft template)

Acceptance checklist for a **playable** Minecraft-like survival base.
Expected behaviour = Java/Bedrock survival unless noted.
**Status legend:** PASS | FAIL | PARTIAL | UNTESTED

Last run: *(filled by playtest)* · Branch/commit: *(filled by playtest)*

## A. World & spawn
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| A1 | New world | Fresh seed; spawn on solid ground (grass/sand/dirt), feet free, not inside a block or underground | UNTESTED | |
| A2 | Sky/ground visible | Overworld sky + terrain load around spawn without black void at feet | UNTESTED | |

## B. Movement (camera-relative)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| B1 | WASD | W forward along look (XZ), S back, A left, D right — relative to yaw | UNTESTED | |
| B2 | Jump | Space jumps ~1.25 blocks; can clear 1-block step with jump | UNTESTED | |
| B3 | Sprint | Double-W or sprint key; faster move, FOV optional | UNTESTED | |
| B4 | Sneak | Shift: slower, no fall off block edges (sneak-edge) | UNTESTED | |
| B5 | Swim | In water: float/swim with jump; slower; exit onto shore | UNTESTED | |
| B6 | No clip | Cannot walk through solid blocks/walls | UNTESTED | |
| B7 | Step-up | Auto step-up ≤1 block without jump (MC does); >1 needs jump | UNTESTED | |

## C. Mining & drops
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| C1 | Hold-to-break | Hold LMB: crack overlay progresses; release cancels | UNTESTED | |
| C2 | Tool times | Wood pick faster on stone than bare hand; bare hand very slow on stone | UNTESTED | |
| C3 | Stone→cobble | Stone mined with pickaxe drops cobblestone; without pickaxe: no drop / nothing useful | UNTESTED | |
| C4 | Log drops | Punch/log axe: drops log item | UNTESTED | |
| C5 | Pickup | Dropped items in world; walk over to pick up into inventory | UNTESTED | |

## D. Placing
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| D1 | Face place | RMB places against targeted block face | UNTESTED | |
| D2 | No self-intersect | Cannot place block overlapping player AABB | UNTESTED | |

## E. Inventory (E)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| E1 | Open/close | E toggles inventory; pointer unlock while open | UNTESTED | |
| E2 | Drag/drop | Click-drag stacks between slots | UNTESTED | |
| E3 | Shift-click | Shift-click moves stack to hotbar/inv | UNTESTED | |
| E4 | 2×2 craft | Inventory 2×2 crafting works (e.g. 4 planks→table, logs→planks) | UNTESTED | |
| E5 | Stack split | Right-click / half-stack split | UNTESTED | |

## F. Crafting table 3×3
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| F1 | Open table | RMB on crafting table opens 3×3 | UNTESTED | |
| F2 | Planks | Log → 4 planks | UNTESTED | |
| F3 | Sticks | 2 planks vertical → 4 sticks | UNTESTED | |
| F4 | Table | 4 planks 2×2 → crafting table | UNTESTED | |
| F5 | Wooden tools | Pickaxe/axe/shovel/sword recipes | UNTESTED | |
| F6 | Stone tools | Cobble + sticks recipes | UNTESTED | |
| F7 | Furnace | 8 cobble ring → furnace | UNTESTED | |
| F8 | Torch | Coal + stick → 4 torches | UNTESTED | |
| F9 | Chest | 8 planks ring → chest | UNTESTED | |
| F10 | Door | 6 planks → door | UNTESTED | |
| F11 | Bed | 3 wool + 3 planks → bed | UNTESTED | |

## G. Furnace & chest
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| G1 | Smelt | Ore/food + fuel → result after time | UNTESTED | |
| G2 | Fuel | Coal/wood consume as fuel | UNTESTED | |
| G3 | Chest persist | Items in chest survive save/reload | UNTESTED | |

## H. Survival vitals
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| H1 | Health | Hearts; damage reduces HP | UNTESTED | |
| H2 | Hunger | Hunger drains; eating restores | UNTESTED | |
| H3 | Fall damage | Fall from height deals damage | UNTESTED | |
| H4 | Drown | Underwater air bar; then HP loss | UNTESTED | |
| H5 | Death/respawn | Death screen; respawn at bed/world spawn with emptied/kept rules as implemented | UNTESTED | |

## I. Day/night & mobs
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| I1 | Day/night | Sky/lighting cycle | UNTESTED | |
| I2 | Hostiles at night | Zombies/skeletons/etc. spawn/hostile at night | UNTESTED | |
| I3 | Passive drops | Animals drop items when killed | UNTESTED | |
| I4 | Combat KB | Melee hits mob with knockback | UNTESTED | |
| I5 | Torches light | Torch brightens nearby blocks | UNTESTED | |

## J. Persistence & UI
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| J1 | Save/reload | Reload page: same world blocks, inventory, position | UNTESTED | |
| J2 | Pause/settings | Pause menu; mouse sensitivity; render distance | UNTESTED | |
| J3 | FPS | Playable FPS near spawn (target ≥30 headless/desktop) | UNTESTED | |

## K. Survival session (from scratch, real input)
| # | Check | Minecraft-expected | Status | Notes |
|---|--------|-------------------|--------|-------|
| K1 | Punch tree → logs | | UNTESTED | |
| K2 | Craft planks + table | | UNTESTED | |
| K3 | Craft wooden pickaxe | | UNTESTED | |
| K4 | Mine stone → cobble | | UNTESTED | |
| K5 | Stone tools + furnace | | UNTESTED | |
| K6 | Shelter + torch before night | | UNTESTED | |
| K7 | Survive night | | UNTESTED | |

## Method rules
1. **Real input:** synthesized keyboard/mouse via pointer lock. `__bv` may set up a scenario only — never perform the action under test.
2. Log every bug and every deviation from Minecraft.
3. Fix blockers → core loop → polish; retest after each fix.
