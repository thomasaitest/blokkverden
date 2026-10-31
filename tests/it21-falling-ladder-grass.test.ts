import { describe, it, expect } from 'vitest';
import { BlockId, isReplaceable, isCrossPlant } from '../src/blocks/types';
import { FallingBlocks } from '../src/world/fallingBlocks';
import { ladderMetaFromNormal, ladderWall, ladderPanel } from '../src/world/ladder';
import { selectionBox } from '../src/world/outline';
import { growDoubleGrass, breakPartner, fixOrphans } from '../src/world/doubleGrass';
import { applyBoneMeal } from '../src/world/bonemeal';
import { hazardAhead } from '../src/mobs/system';
import { dropForBlock } from '../src/items/types';
import { isWashable } from '../src/world/water';
import { isFlammable, openToSky } from '../src/world/fire';

class FakeWorld {
  b = new Map<string, number>();
  m = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.b.get(`${x},${y},${z}`) ?? 0; }
  setBlock(x: number, y: number, z: number, id: number) { const k = `${x},${y},${z}`; if (id) this.b.set(k, id); else this.b.delete(k); this.m.delete(k); return true; }
  getWaterLevel(x: number, y: number, z: number) { return this.m.get(`${x},${y},${z}`) ?? 0; }
  setMeta(x: number, y: number, z: number, v: number) { this.m.set(`${x},${y},${z}`, v); }
}
function floor(w: FakeWorld, y: number, id: number = BlockId.Stone) { for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) w.setBlock(x, y, z, id); }
const run = (f: FallingBlocks, w: FakeWorld, secs: number, onPop?: (x: number, y: number, z: number, id: number) => void) => { for (let t = 0; t < secs; t += 1 / 60) f.step(1 / 60, w, undefined, onPop); };

describe('it21 falling sand/gravel entities (MC)', () => {
  it('sand placed in mid-air becomes a moving entity and lands after a visible fall', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 10, 0, BlockId.Sand);
    const f = new FallingBlocks();
    expect(f.updateAround(w, 0, 10, 0)).toBe(1);
    expect(w.getBlock(0, 10, 0)).toBe(0);
    expect(f.list.length).toBe(1);
    run(f, w, 0.3);
    expect(f.list.length).toBe(1); // still in the air after 0.3 s (9 blocks takes ~1.1 s)
    const midY = f.list[0].y;
    expect(midY).toBeLessThan(10); expect(midY).toBeGreaterThan(1);
    run(f, w, 1.5);
    expect(f.list.length).toBe(0);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Sand);
  });
  it('a gravel column falls together and stacks in order', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.Dirt);
    for (let y = 2; y <= 4; y++) w.setBlock(0, y, 0, BlockId.Gravel);
    w.setBlock(0, 1, 0, 0);
    const f = new FallingBlocks();
    expect(f.updateAround(w, 0, 1, 0)).toBe(3);
    run(f, w, 2);
    expect([1, 2, 3, 4].map((y) => w.getBlock(0, y, 0))).toEqual([BlockId.Gravel, BlockId.Gravel, BlockId.Gravel, 0]);
  });
  it('landing on a torch breaks the falling block into an item; supported sand does not fall', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.Torch);
    w.setBlock(0, 6, 0, BlockId.Sand);
    const f = new FallingBlocks(); const pops: number[] = [];
    f.updateAround(w, 0, 6, 0);
    run(f, w, 2, (_x, _y, _z, id) => pops.push(id));
    expect(pops).toEqual([BlockId.Sand]);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Torch);
    w.setBlock(2, 1, 0, BlockId.Sand);
    expect(f.updateAround(w, 2, 1, 0)).toBe(0);
  });
  it('falls through water and tall grass; flush() settles everything instantly (save)', () => {
    const w = new FakeWorld(); floor(w, 0);
    w.setBlock(0, 1, 0, BlockId.TallGrass); w.setBlock(0, 2, 0, BlockId.Water);
    w.setBlock(0, 8, 0, BlockId.Sand);
    const f = new FallingBlocks(); f.updateAround(w, 0, 8, 0);
    f.flush(w);
    expect(f.list.length).toBe(0);
    expect(w.getBlock(0, 1, 0)).toBe(BlockId.Sand);
  });
});

describe('it21 ladders hang on their wall (MC)', () => {
  it('meta from the clicked side face; top/bottom faces are refused', () => {
    expect(ladderMetaFromNormal(1, 0, 0)).toBe(1);
    expect(ladderMetaFromNormal(-1, 0, 0)).toBe(2);
    expect(ladderMetaFromNormal(0, 0, 1)).toBe(3);
    expect(ladderMetaFromNormal(0, 0, -1)).toBe(4);
    expect(ladderMetaFromNormal(0, 1, 0)).toBeNull();
    expect(ladderMetaFromNormal(0, -1, 0)).toBeNull();
  });
  it('wall from meta, or inferred from a solid neighbour for old ladders (meta 0)', () => {
    const w = new FakeWorld();
    w.setBlock(5, 3, 4, BlockId.Stone); // +X of (4,3,4)
    expect(ladderWall(0, (x, y, z) => w.getBlock(x, y, z), 4, 3, 4)).toBe(1);
    expect(ladderWall(3, (x, y, z) => w.getBlock(x, y, z), 4, 3, 4)).toBe(2);
  });
  it('selection outline is a thin panel against the wall, not a full block', () => {
    const b = selectionBox(BlockId.Ladder, 1, 1, 0);
    expect(b).toEqual([0, 0, 0, 3 / 16, 1, 1]);
    const [x0, z0, x1, z1] = ladderPanel(3);
    expect([x0, z0, x1, z1]).toEqual([0, 13 / 16, 1, 1]);
  });
});

describe('it21 double tall grass (MC)', () => {
  it('bone meal on tall grass grows double tall grass (needs air above)', () => {
    const w = new FakeWorld(); floor(w, 0, BlockId.Grass);
    w.setBlock(0, 1, 0, BlockId.TallGrass);
    expect(applyBoneMeal(w, 0, 1, 0, () => 0.5)).toBe(true);
    expect([w.getBlock(0, 1, 0), w.getBlock(0, 2, 0)]).toEqual([BlockId.DoubleGrass, BlockId.DoubleGrassTop]);
    w.setBlock(1, 1, 0, BlockId.TallGrass); w.setBlock(1, 2, 0, BlockId.Stone);
    expect(applyBoneMeal(w, 1, 1, 0, () => 0.5)).toBe(false);
    expect(growDoubleGrass(w, 1, 1, 0)).toBe(false);
  });
  it('breaking either half removes both; only the lower half can drop seeds; orphans are cleaned up', () => {
    const w = new FakeWorld(); floor(w, 0, BlockId.Grass);
    w.setBlock(0, 1, 0, BlockId.TallGrass); growDoubleGrass(w, 0, 1, 0);
    w.setBlock(0, 2, 0, 0);
    expect(breakPartner(w, 0, 2, 0, BlockId.DoubleGrassTop)).toEqual([0, 1, 0]);
    expect(w.getBlock(0, 1, 0)).toBe(0);
    w.setBlock(0, 1, 0, BlockId.TallGrass); growDoubleGrass(w, 0, 1, 0);
    w.setBlock(0, 1, 0, 0);
    breakPartner(w, 0, 1, 0, BlockId.DoubleGrass);
    expect(w.getBlock(0, 2, 0)).toBe(0);
    expect(dropForBlock(BlockId.DoubleGrassTop, null)).toBeNull();
    w.setBlock(3, 2, 3, BlockId.DoubleGrassTop); // floating top half (e.g. lower half burnt/washed away)
    w.setBlock(4, 1, 4, BlockId.DoubleGrass);    // lower half without top
    expect(fixOrphans(w, 0, 1, 0, 6)).toBe(2);
    expect(w.getBlock(3, 2, 3)).toBe(0);
    expect(w.getBlock(4, 1, 4)).toBe(BlockId.TallGrass);
  });
  it('is a replaceable, washable, flammable cross plant that rain falls through', () => {
    for (const id of [BlockId.DoubleGrass, BlockId.DoubleGrassTop]) {
      expect(isCrossPlant(id)).toBe(true); expect(isReplaceable(id)).toBe(true);
      expect(isWashable(id)).toBe(true); expect(isFlammable(id)).toBe(true);
    }
    const w = new FakeWorld(); w.setBlock(0, 5, 0, BlockId.DoubleGrass); w.setBlock(0, 6, 0, BlockId.DoubleGrassTop);
    expect(openToSky(w, 0, 4, 0)).toBe(true);
  });
});

describe('it21 mobs avoid fire and lava (MC pathfinding)', () => {
  it('fire or lava ahead (feet, head or floor) is a hazard; plain ground is not', () => {
    const w = new FakeWorld(); floor(w, 0);
    expect(hazardAhead(w, 0.5, 1, 0.5, 1, 0)).toBe(false);
    w.setBlock(1, 1, 0, BlockId.Fire);
    expect(hazardAhead(w, 0.5, 1, 0.5, 1, 0)).toBe(true);
    expect(hazardAhead(w, 0.5, 1, 0.5, -1, 0)).toBe(false);
    w.setBlock(0, 0, 1, BlockId.Lava); // lava pool in the floor
    expect(hazardAhead(w, 0.5, 1, 0.5, 0, 1)).toBe(true);
  });
});
