const TILE = 16;
export const COLS = 8;
export const ROWS = 8;
export const ATLAS_SIZE = TILE * COLS;

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 0x9e3779b9);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

function setPx(d: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= ATLAS_SIZE || y >= ATLAS_SIZE) return;
  const i = (y * ATLAS_SIZE + x) * 4;
  d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
}

function fillTile(
  d: Uint8ClampedArray,
  tile: number,
  paint: (lx: number, ly: number, rnd: number) => [number, number, number, number],
): void {
  const tx = (tile % COLS) * TILE;
  const ty = Math.floor(tile / COLS) * TILE;
  for (let ly = 0; ly < TILE; ly++) {
    for (let lx = 0; lx < TILE; lx++) {
      const rnd = hash(tile * 997 + ly * 31 + lx * 17);
      const [r, g, b, a] = paint(lx, ly, rnd);
      setPx(d, tx + lx, ty + ly, r, g, b, a);
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

  fillTile(d, 0, (_x, _y, rnd) => [40 + rnd * 20, 90 + rnd * 40, 30 + rnd * 15, 255]);
  fillTile(d, 1, (_x, _y, rnd) => [90 + rnd * 35, 60 + rnd * 20, 30 + rnd * 15, 255]);
  fillTile(d, 2, (_x, ly, rnd) => (ly < 3 ? [40, 90 + rnd * 40, 30, 255] : [90 + rnd * 35, 60, 30, 255]));
  fillTile(d, 3, (_x, _y, rnd) => { const v = 110 + rnd * 40; return [v, v, v + 5, 255]; });
  fillTile(d, 4, (lx, ly, rnd) => { const v = (lx % 4 === 0 || ly % 4 === 0) ? 70 : 100 + rnd * 45; return [v, v, v, 255]; });
  fillTile(d, 5, (lx, ly, rnd) => {
    const r2 = (lx - 7.5) ** 2 + (ly - 7.5) ** 2;
    return r2 < 20 ? [160 + rnd * 20, 120, 60, 255] : [90, 55, 25, 255];
  });
  fillTile(d, 6, (_x, ly, rnd) => { const v = 100 + Math.sin(ly * 0.8) * 8 + rnd * 15; return [v, v * 0.6, v * 0.3, 255]; });
  fillTile(d, 7, (_x, ly, rnd) => { const v = ly % 4 === 0 ? 120 : 170 + rnd * 25; return [v, v * 0.75, v * 0.4, 255]; });
  fillTile(d, 8, (_x, _y, rnd) => (rnd < 0.25 ? [0, 0, 0, 0] : [30, 90 + rnd * 50, 25, 220]));
  fillTile(d, 9, (_x, _y, rnd) => { const v = 200 + rnd * 35; return [v, v - 20, 120 + rnd * 20, 255]; });
  fillTile(d, 10, (lx, ly) => ((lx === 0 || ly === 0 || lx === 15 || ly === 15) ? [180, 220, 230, 180] : [200, 230, 240, 60]));
  fillTile(d, 11, (_x, _y, rnd) => [30, 100 + rnd * 30, 180 + rnd * 40, 160]);
  fillTile(d, 12, (lx, ly, rnd) => {
    if (ly < 2 || ly > 13 || lx < 2 || lx > 13) return [140 + rnd * 20, 100, 40, 255];
    if (lx === 5 || lx === 10 || ly === 5 || ly === 10) return [80, 50, 20, 255];
    return [180 + rnd * 20, 140, 70, 255];
  });
  fillTile(d, 13, (lx, ly) => (Math.abs(lx - ly) <= 1 && lx >= 2 && lx <= 13 ? [160, 110, 50, 255] : [0, 0, 0, 0]));
  fillTile(d, 14, (lx, ly) => {
    if (ly >= 10 && lx >= 6 && lx <= 9) return [140, 90, 40, 255];
    if (ly >= 3 && ly <= 9 && lx >= 4 && lx <= 11) return [180, 140, 70, 255];
    return [0, 0, 0, 0];
  });
  fillTile(d, 15, (lx, ly) => {
    if (ly >= 10 && lx >= 6 && lx <= 9) return [140, 90, 40, 255];
    if (ly >= 3 && ly <= 9 && lx >= 4 && lx <= 11) return [130, 130, 135, 255];
    return [0, 0, 0, 0];
  });
  // 16 torch
  fillTile(d, 16, (lx, ly) => {
    if (ly >= 10 && lx >= 7 && lx <= 8) return [90, 55, 25, 255];
    if (ly >= 4 && ly <= 9 && lx >= 6 && lx <= 9) return [255, 200 + (ly % 3) * 10, 40, 255];
    return [0, 0, 0, 0];
  });
  // 17 chest
  fillTile(d, 17, (lx, ly, rnd) => {
    if (ly === 6 || ly === 7) return [40, 40, 40, 255];
    const v = 150 + rnd * 30;
    return [v, v * 0.65, 30, 255];
  });
  // 18 furnace front
  fillTile(d, 18, (lx, ly, rnd) => {
    const v = 90 + rnd * 30;
    if (lx >= 4 && lx <= 11 && ly >= 4 && ly <= 10) return [30, 20, 15, 255];
    if (lx >= 5 && lx <= 10 && ly >= 5 && ly <= 8) return [220, 100 + rnd * 40, 20, 255];
    return [v, v, v, 255];
  });
  // 19 unused / furnace side look
  fillTile(d, 19, (_x, _y, rnd) => { const v = 95 + rnd * 25; return [v, v, v, 255]; });
  // ores 20-23
  fillTile(d, 20, (lx, ly, rnd) => {
    const base = 110 + rnd * 30;
    const ore = (lx + ly) % 5 === 0;
    return ore ? [20, 20, 20, 255] : [base, base, base, 255];
  });
  fillTile(d, 21, (lx, ly, rnd) => {
    const base = 110 + rnd * 30;
    const ore = (lx * 3 + ly * 2) % 7 === 0;
    return ore ? [200, 160, 140, 255] : [base, base, base, 255];
  });
  fillTile(d, 22, (lx, ly, rnd) => {
    const base = 110 + rnd * 30;
    const ore = (lx + ly * 3) % 6 === 0;
    return ore ? [255, 215, 60, 255] : [base, base, base, 255];
  });
  fillTile(d, 23, (lx, ly, rnd) => {
    const base = 110 + rnd * 30;
    const ore = (lx * 2 + ly) % 8 === 0;
    return ore ? [80, 220, 230, 255] : [base, base, base, 255];
  });
  // snow
  fillTile(d, 24, (_x, _y, rnd) => { const v = 230 + rnd * 25; return [v, v, 245, 255]; });
  fillTile(d, 25, (_x, ly, rnd) => (ly < 3 ? [230 + rnd * 20, 230 + rnd * 20, 245, 255] : [90 + rnd * 30, 60, 30, 255]));
  // items
  fillTile(d, 26, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 5 ? [30, 30, 30, 255] : [0, 0, 0, 0]));
  fillTile(d, 27, (lx, ly) => {
    const r2 = (lx - 8) ** 2 + (ly - 9) ** 2;
    if (r2 < 28) return [220, 40, 40, 255];
    if (ly < 5 && lx >= 7 && lx <= 9) return [40, 140, 40, 255];
    return [0, 0, 0, 0];
  });
  fillTile(d, 28, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 5 ? [200, 170, 150, 255] : [0, 0, 0, 0]));
  fillTile(d, 29, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 5 ? [255, 215, 50, 255] : [0, 0, 0, 0]));
  fillTile(d, 30, (lx, ly) => {
    if (Math.abs(lx - 8) + Math.abs(ly - 8) < 6) return [80, 230, 240, 255];
    return [0, 0, 0, 0];
  });
  fillTile(d, 31, (_x, _y, rnd) => { const v = 100 + rnd * 30; return [v, v, v, 255]; });
  // 32 bed
  fillTile(d, 32, (lx, ly, rnd) => {
    if (ly < 4) return [220, 50, 50, 255];
    if (ly < 8) return [240, 240, 245, 255];
    return [140 + rnd * 20, 90, 40, 255];
  });
  // 33 wool
  fillTile(d, 33, (_x, _y, rnd) => {
    const v = 220 + rnd * 30;
    return [v, v, v, 255];
  });
  // 34 iron block-ish / armor icon
  fillTile(d, 34, (_x, _y, rnd) => { const v = 180 + rnd * 40; return [v, v, v + 10, 255]; });
  // 35 diamond icon
  fillTile(d, 35, (lx, ly) => (Math.abs(lx - 8) + Math.abs(ly - 8) < 6 ? [80, 230, 240, 255] : [0, 0, 0, 0]));


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
