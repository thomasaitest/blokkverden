import { BlockId } from '../blocks/types';
import { doorPanel } from './doors';
import { ladderPanel } from './ladder';

/** [x0, y0, z0, x1, y1, z1] relative to the block's min corner. */
export type Box6 = [number, number, number, number, number, number];

/**
 * it20 (MC): the black selection outline follows the block's real shape instead of always a full cube:
 * doors are a thin 2-tall panel, slabs/pressure plates are low, plants and crops are smaller boxes.
 * `level` = the cell's stored water/crop level (crop growth stage), used for crop height.
 */
export function selectionBox(id: number, meta: number, level = 0, ladderWallDir = 2): Box6 {
  const p = 1 / 16;
  switch (id) {
    case BlockId.Door: { const [x0, z0, x1, z1] = doorPanel(meta); return [x0, 0, z0, x1, 2, z1]; }
    case BlockId.Ladder: { const [x0, z0, x1, z1] = ladderPanel(ladderWallDir); return [x0, 0, z0, x1, 1, z1]; }
    // MC: one 2-tall outline around both halves
    case BlockId.DoubleGrass: return [2 * p, 0, 2 * p, 14 * p, 2, 14 * p];
    case BlockId.DoubleGrassTop: return [2 * p, -1, 2 * p, 14 * p, 1, 14 * p];
    case BlockId.Slab: return [0, 0, 0, 1, 0.5, 1];
    case BlockId.PressurePlate: return [p, 0, p, 1 - p, p, 1 - p];
    case BlockId.TallGrass: return [2 * p, 0, 2 * p, 14 * p, 13 * p, 14 * p];
    case BlockId.Sapling: return [2 * p, 0, 2 * p, 14 * p, 12 * p, 14 * p];
    case BlockId.Dandelion: case BlockId.Poppy: return [5 * p, 0, 5 * p, 11 * p, 10 * p, 11 * p];
    case BlockId.Crop: return [0, 0, 0, 1, Math.min(1, 0.4 + level * 0.085), 1];
    case BlockId.Torch: return [6 * p, 0, 6 * p, 10 * p, 12 * p, 10 * p];
    case BlockId.Fire: return [0, 0, 0, 1, p, 1];
    default: return [0, 0, 0, 1, 1, 1];
  }
}
