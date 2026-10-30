import { ItemId, stack, ITEMS, type ItemStack } from './types';

export interface SmeltRecipe {
  input: number;
  output: ItemStack;
  time: number; // ticks (~1/20s), we'll use seconds*20
}

export const SMELT_RECIPES: SmeltRecipe[] = [
  { input: ItemId.Cobble, output: stack(ItemId.Stone, 1), time: 200 },
  { input: ItemId.Sand, output: stack(ItemId.Glass, 1), time: 200 },
  { input: ItemId.IronOre, output: stack(ItemId.IronIngot, 1), time: 200 },
  { input: ItemId.GoldOre, output: stack(ItemId.GoldIngot, 1), time: 200 },
  { input: ItemId.Apple, output: stack(ItemId.CookedApple, 1), time: 100 },
  { input: ItemId.RawMeat, output: stack(ItemId.CookedMeat, 1), time: 100 },
  { input: ItemId.RawFish, output: stack(ItemId.CookedFish, 1), time: 100 },
  { input: ItemId.Log, output: stack(ItemId.Coal, 1), time: 200 }, // charcoal-ish
];

export function findSmelt(input: ItemStack | null): SmeltRecipe | null {
  if (!input) return null;
  return SMELT_RECIPES.find((r) => r.input === input.id) ?? null;
}

export function fuelValue(s: ItemStack | null): number {
  if (!s) return 0;
  return ITEMS[s.id]?.fuel ?? 0;
}

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  burnLeft: number;
  burnMax: number;
  cook: number;
  cookMax: number;
}

export function createFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, burnLeft: 0, burnMax: 0, cook: 0, cookMax: 0 };
}

/** Advance furnace by dt seconds. */
export function tickFurnace(f: FurnaceState, dt: number): void {
  const ticks = dt * 20;
  const recipe = findSmelt(f.input);

  if (f.burnLeft > 0) f.burnLeft -= ticks;

  if (recipe && f.input) {
    f.cookMax = recipe.time;
    const canOutput =
      !f.output ||
      (f.output.id === recipe.output.id && f.output.count + recipe.output.count <= (ITEMS[recipe.output.id]?.maxStack ?? 64));

    if (canOutput) {
      if (f.burnLeft <= 0) {
        const fv = fuelValue(f.fuel);
        if (fv > 0 && f.fuel) {
          f.burnLeft = fv;
          f.burnMax = fv;
          f.fuel.count -= 1;
          if (f.fuel.count <= 0) f.fuel = null;
        }
      }
      if (f.burnLeft > 0) {
        f.cook += ticks;
        if (f.cook >= recipe.time) {
          f.cook = 0;
          f.input!.count -= 1;
          if (f.input!.count <= 0) f.input = null;
          if (!f.output) f.output = { ...recipe.output };
          else f.output.count += recipe.output.count;
        }
      } else {
        f.cook = Math.max(0, f.cook - ticks);
      }
    }
  } else {
    f.cook = 0;
    f.cookMax = 0;
  }
}
