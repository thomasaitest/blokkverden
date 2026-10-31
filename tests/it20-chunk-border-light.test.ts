import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocks/types';
import { World } from '../src/world/world';

function arena() {
  const w = new World(3);
  for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) w.ensureChunk(cx, cz);
  for (let x = -4; x < 32; x++) for (let z = 0; z < 32; z++) { w.setBlock(x, 45, z, BlockId.Stone); for (let y = 46; y < 60; y++) w.setBlock(x, y, z, BlockId.Air); }
  return w;
}
const relight = (w: World, keys: string[]) => { for (const k of keys) { w.getChunk(+k.split(',')[0], +k.split(',')[1])!.lightDirty = true; } for (const k of keys) w.remeshSync(k); };

describe('it20 block light crosses chunk borders (torch a few blocks from the edge)', () => {
  it('a torch 4 blocks inside chunk 0 lights chunk 1 and the diagonal chunk, whatever order chunks are relit in', () => {
    for (const order of [['0,0', '1,0', '1,1', '0,1'], ['1,1', '1,0', '0,1', '0,0']]) {
      const w = arena();
      w.setBlock(12, 46, 12, BlockId.Torch);
      relight(w, order);
      expect(w.getBlockLight(12, 46, 12)).toBe(14);
      expect(w.getBlockLight(17, 46, 12)).toBe(9);  // 5 steps, chunk 1,0
      expect(w.getBlockLight(12, 46, 17)).toBe(9);  // chunk 0,1
      expect(w.getBlockLight(17, 46, 17)).toBe(4);  // diagonal chunk 1,1 (10 steps)
    }
  });
  it('removing the torch leaves no ghost light in the neighbour (both relight orders)', () => {
    for (const order of [['0,0', '1,0', '1,1', '0,1'], ['1,0', '1,1', '0,1', '0,0']]) {
      const w = arena();
      w.setBlock(12, 46, 12, BlockId.Torch);
      relight(w, ['0,0', '1,0', '1,1', '0,1']);
      w.setBlock(12, 46, 12, BlockId.Air);
      relight(w, order);
      expect(w.getBlockLight(17, 46, 12)).toBe(0);
      expect(w.getBlockLight(13, 46, 12)).toBe(0);
      expect(w.getBlockLight(17, 46, 17)).toBe(0);
    }
  });
  it('walls still block light across the border', () => {
    const w = arena();
    for (let z = 0; z < 32; z++) for (let y = 46; y < 60; y++) w.setBlock(15, y, z, BlockId.Stone);
    for (let x = -4; x < 32; x++) for (let z = 0; z < 32; z++) w.setBlock(x, 59, z, BlockId.Stone);
    w.setBlock(12, 46, 12, BlockId.Torch);
    relight(w, ['1,0', '0,0']);
    expect(w.getBlockLight(16, 46, 12)).toBe(0);
  });
});
