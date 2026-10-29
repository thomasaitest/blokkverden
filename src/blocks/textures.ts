/** Procedural 16×16 pixel-art atlas — original Blokkverden art. */
const TILE = 16;
const COLS = 4;
const ROWS = 4;
export const ATLAS_SIZE = TILE * COLS;

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 0x9e3779b9);
  n = n ^ (n >>> 13);
  return (n >>> 0) / 4294967296;
}

function setPx(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= ATLAS_SIZE || y >= ATLAS_SIZE) return;
  const i = (y * ATLAS_SIZE + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function fillTile(
  data: Uint8ClampedArray,
  tile: number,
  paint: (lx: number, ly: number, rnd: number) => [number, number, number, number],
): void {
  const tx = (tile % COLS) * TILE;
  const ty = Math.floor(tile / COLS) * TILE;
  for (let ly = 0; ly < TILE; ly++) {
    for (let lx = 0; lx < TILE; lx++) {
      const rnd = hash(tile * 997 + ly * 31 + lx * 17);
      const [r, g, b, a] = paint(lx, ly, rnd);
      setPx(data, tx + lx, ty + ly, r, g, b, a);
    }
  }
}

export function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
  const d = img.data;

  fillTile(d, 0, (_lx, _ly, rnd) => {
    const v = 90 + Math.floor(rnd * 40);
    return [40 + Math.floor(rnd * 20), v, 30 + Math.floor(rnd * 15), 255];
  });
  fillTile(d, 1, (_lx, _ly, rnd) => {
    const v = 90 + Math.floor(rnd * 35);
    return [v, 60 + Math.floor(rnd * 20), 30 + Math.floor(rnd * 15), 255];
  });
  fillTile(d, 2, (_lx, ly, rnd) => {
    if (ly < 3) {
      const v = 90 + Math.floor(rnd * 40);
      return [40, v, 30, 255];
    }
    const v = 90 + Math.floor(rnd * 35);
    return [v, 60, 30, 255];
  });
  fillTile(d, 3, (_lx, _ly, rnd) => {
    const v = 110 + Math.floor(rnd * 40);
    return [v, v, v + 5, 255];
  });
  fillTile(d, 4, (lx, ly, rnd) => {
    const seam = lx % 4 === 0 || ly % 4 === 0;
    const v = seam ? 70 : 100 + Math.floor(rnd * 45);
    return [v, v, v, 255];
  });
  fillTile(d, 5, (lx, ly, rnd) => {
    const cx = lx - 7.5;
    const cy = ly - 7.5;
    const r2 = cx * cx + cy * cy;
    if (r2 < 20) return [160 + Math.floor(rnd * 20), 120, 60, 255];
    return [90, 55, 25, 255];
  });
  fillTile(d, 6, (_lx, ly, rnd) => {
    const stripe = Math.sin(ly * 0.8) * 8;
    const v = 100 + stripe + rnd * 15;
    return [v, v * 0.6, v * 0.3, 255];
  });
  fillTile(d, 7, (_lx, ly, rnd) => {
    const seam = ly % 4 === 0;
    const v = seam ? 120 : 170 + Math.floor(rnd * 25);
    return [v, v * 0.75, v * 0.4, 255];
  });
  fillTile(d, 8, (_lx, _ly, rnd) => {
    if (rnd < 0.25) return [0, 0, 0, 0];
    const v = 50 + Math.floor(rnd * 50);
    return [30, v + 40, 25, 220];
  });
  fillTile(d, 9, (_lx, _ly, rnd) => {
    const v = 200 + Math.floor(rnd * 35);
    return [v, v - 20, 120 + Math.floor(rnd * 20), 255];
  });
  fillTile(d, 10, (lx, ly) => {
    const edge = lx === 0 || ly === 0 || lx === 15 || ly === 15;
    if (edge) return [180, 220, 230, 180];
    return [200, 230, 240, 60];
  });
  fillTile(d, 11, (_lx, _ly, rnd) => {
    const v = 60 + Math.floor(rnd * 40);
    return [30, 80 + v * 0.3, 180 + Math.floor(rnd * 40), 160];
  });
  // 12 crafting table side/top
  fillTile(d, 12, (lx, ly, rnd) => {
    if (ly < 2 || ly > 13 || lx < 2 || lx > 13) {
      const v = 140 + rnd * 20;
      return [v, v * 0.7, v * 0.35, 255];
    }
    // tool grid hint
    if ((lx === 5 || lx === 10 || ly === 5 || ly === 10) && lx > 2 && lx < 13) return [80, 50, 20, 255];
    return [180 + rnd * 20, 140, 70, 255];
  });
  // 13 stick
  fillTile(d, 13, (lx, ly) => {
    const on = Math.abs(lx - ly) <= 1 && lx >= 2 && lx <= 13;
    if (on) return [160, 110, 50, 255];
    return [0, 0, 0, 0];
  });
  // 14 wood tool
  fillTile(d, 14, (lx, ly) => {
    if (ly >= 10 && lx >= 6 && lx <= 9) return [140, 90, 40, 255];
    if (ly >= 3 && ly <= 9 && lx >= 4 && lx <= 11) return [180, 140, 70, 255];
    return [0, 0, 0, 0];
  });
  // 15 stone tool
  fillTile(d, 15, (lx, ly) => {
    if (ly >= 10 && lx >= 6 && lx <= 9) return [140, 90, 40, 255];
    if (ly >= 3 && ly <= 9 && lx >= 4 && lx <= 11) return [130, 130, 135, 255];
    return [0, 0, 0, 0];
  });

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % COLS;
  const row = Math.floor(tile / COLS);
  const u0 = col / COLS;
  const v0 = row / ROWS;
  return { u0, v0, u1: u0 + 1 / COLS, v1: v0 + 1 / ROWS };
}
