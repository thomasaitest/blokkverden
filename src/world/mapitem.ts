import { BlockId } from '../blocks/types';
import type { World } from './world';
import { biomeAt } from './terrain';
import type { SeededNoise } from './noise';

export function renderMapCanvas(
  canvas: HTMLCanvasElement,
  world: World,
  noise: SeededNoise,
  px: number,
  pz: number,
  radius = 48,
): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.createImageData(w, h);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const wx = Math.floor(px + (sx / w - 0.5) * radius * 2);
      const wz = Math.floor(pz + (sy / h - 0.5) * radius * 2);
      let r = 40, g = 80, b = 40;
      let top = 0;
      for (let y = 70; y > 0; y--) {
        const id = world.getBlock(wx, y, wz);
        if (id !== BlockId.Air) { top = id; break; }
      }
      if (top === BlockId.Water) { r = 40; g = 90; b = 180; }
      else if (top === BlockId.Sand) { r = 210; g = 190; b = 120; }
      else if (top === BlockId.SnowGrass) { r = 230; g = 240; b = 250; }
      else if (top === BlockId.Stone || top === BlockId.Cobble) { r = 110; g = 110; b = 110; }
      else if (top === BlockId.Leaves) { r = 40; g = 120; b = 40; }
      else if (top === BlockId.Log || top === BlockId.Planks) { r = 120; g = 80; b = 40; }
      else {
        const bio = biomeAt(noise, wx, wz);
        if (bio === 'desert') { r = 200; g = 180; b = 100; }
        else if (bio === 'snow') { r = 220; g = 230; b = 240; }
        else { r = 70; g = 140; b = 60; }
      }
      const i = (sy * w + sx) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  // player marker
  const mx = (w / 2) | 0, my = (h / 2) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = ((my + dy) * w + (mx + dx)) * 4;
    if (i >= 0 && i < img.data.length) {
      img.data[i] = 255; img.data[i + 1] = 40; img.data[i + 2] = 40;
    }
  }
  ctx.putImageData(img, 0, 0);
}
