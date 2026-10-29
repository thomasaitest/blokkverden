const TILE = 16;
export const COLS = 8;
export const ROWS = 10;
export const ATLAS_W = TILE * COLS;
export const ATLAS_H = TILE * ROWS;
/** @deprecated use ATLAS_W — kept for icon drawing width */
export const ATLAS_SIZE = ATLAS_W;

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 0x9e3779b9);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

function setPx(d: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= ATLAS_W || y >= ATLAS_H) return;
  const i = (y * ATLAS_W + x) * 4;
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
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(ATLAS_W, ATLAS_H);
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



  // 36 farmland
  fillTile(d, 36, (_x, ly, rnd) => {
    const v = 70 + rnd * 25;
    return ly < 3 ? [v + 20, v - 10, 20, 255] : [v, v * 0.7, 25, 255];
  });
  // 37 crop young
  fillTile(d, 37, (lx, ly) => {
    if (ly > 10 && Math.abs(lx - 8) < 2) return [40, 120, 30, 255];
    if (ly > 6 && Math.abs(lx - 8) < 1) return [50, 140, 40, 255];
    return [0, 0, 0, 0];
  });
  // 38 crop ripe
  fillTile(d, 38, (lx, ly) => {
    if (ly > 4 && Math.abs(lx - 8) < 3) return [200, 180, 40, 255];
    if (ly > 10 && Math.abs(lx - 8) < 2) return [80, 140, 30, 255];
    return [0, 0, 0, 0];
  });
  // 39 enchant table
  fillTile(d, 39, (lx, ly, rnd) => {
    if (ly < 3) return [40, 20, 60, 255];
    if (ly > 12) return [30, 30, 40, 255];
    return [80 + rnd * 40, 40, 140 + rnd * 40, 255];
  });
  // 40 boat
  fillTile(d, 40, (lx, ly) => {
    if (ly > 8 && lx > 2 && lx < 13) return [140, 90, 40, 255];
    if (ly > 4 && ly <= 8 && (lx === 3 || lx === 12)) return [120, 80, 35, 255];
    return [0, 0, 0, 0];
  });
  // 41 bread
  fillTile(d, 41, (lx, ly) => (Math.hypot(lx - 8, ly - 9) < 5 ? [200, 150, 70, 255] : [0, 0, 0, 0]));
  // 42 seeds
  fillTile(d, 42, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 3 ? [180, 160, 60, 255] : [0, 0, 0, 0]));
  // 43 xp orb
  fillTile(d, 43, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 5 ? [80, 255, 80, 255] : [0, 0, 0, 0]));
  // 44 hoe
  fillTile(d, 44, (lx, ly) => {
    if (ly >= 8 && lx >= 6 && lx <= 9) return [140, 90, 40, 255];
    if (ly >= 3 && ly <= 7 && lx >= 4 && lx <= 12) return [160, 160, 170, 255];
    return [0, 0, 0, 0];
  });
  // 45 wheat item
  fillTile(d, 45, (lx, ly) => (ly > 4 && Math.abs(lx - 8) < 2 ? [220, 190, 50, 255] : [0, 0, 0, 0]));


  // 46 mob spawner
  fillTile(d, 46, (lx, ly) => {
    if (lx < 2 || ly < 2 || lx > 13 || ly > 13) return [40, 40, 50, 255];
    if ((lx + ly) % 3 === 0) return [80, 180, 80, 255];
    return [30, 30, 40, 255];
  });
  // 47 fishing rod
  fillTile(d, 47, (lx, ly) => {
    if (lx === 4 && ly >= 2 && ly <= 13) return [120, 80, 40, 255];
    if (ly === 3 && lx >= 4 && lx <= 11) return [180, 180, 190, 255];
    if (lx === 11 && ly >= 3 && ly <= 6) return [180, 180, 190, 255];
    return [0, 0, 0, 0];
  });
  // 48 map
  fillTile(d, 48, (lx, ly) => {
    if (lx < 1 || ly < 1 || lx > 14 || ly > 14) return [140, 100, 50, 255];
    if (ly > 9) return [60, 140, 60, 255];
    if (ly > 6) return [80, 160, 80, 255];
    return [70, 140, 200, 255];
  });
  // 49 raw fish
  fillTile(d, 49, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 4 && ly > 5 ? [100, 150, 200, 255] : [0, 0, 0, 0]));
  // 50 cooked fish
  fillTile(d, 50, (lx, ly) => (Math.hypot(lx - 8, ly - 8) < 4 && ly > 5 ? [200, 140, 60, 255] : [0, 0, 0, 0]));
  // 51 trader marker (unused block)
  fillTile(d, 51, (lx, ly) => {
    if (Math.abs(lx - 8) < 3 && ly > 4) return [120, 70, 40, 255];
    if (ly <= 5 && Math.hypot(lx - 8, ly - 4) < 3) return [200, 160, 120, 255];
    return [0, 0, 0, 0];
  });


  // 52 door
  fillTile(d, 52, (lx, ly) => {
    if (lx < 2 || lx > 13) return [90, 60, 30, 255];
    if (ly > 2 && ly < 7 && lx > 9 && lx < 13) return [180, 200, 220, 200];
    return [140, 90, 40, 255];
  });
  // 53 fence
  fillTile(d, 53, (lx, ly) => {
    if ((lx > 5 && lx < 10) || (ly > 4 && ly < 7) || (ly > 10 && ly < 13)) return [140, 90, 40, 255];
    return [0, 0, 0, 0];
  });
  // 54 ladder
  fillTile(d, 54, (lx, ly) => {
    if (lx === 2 || lx === 13) return [120, 80, 35, 255];
    if (ly % 3 === 1 && lx > 2 && lx < 13) return [140, 95, 40, 255];
    return [0, 0, 0, 0];
  });
  // 55 sign
  fillTile(d, 55, (lx, ly) => {
    if (ly > 10 && lx > 6 && lx < 9) return [120, 80, 35, 255];
    if (ly <= 10 && lx > 1 && lx < 14) return [180, 140, 70, 255];
    return [0, 0, 0, 0];
  });
  // 56 red dust
  fillTile(d, 56, (lx, ly) => {
    if (Math.abs(lx - 8) < 2 || Math.abs(ly - 8) < 2) return [180, 40, 40, 255];
    return [0, 0, 0, 0];
  });
  // 57 lever/button
  fillTile(d, 57, (lx, ly) => {
    if (Math.hypot(lx - 8, ly - 8) < 4) return [100, 100, 100, 255];
    if (lx > 6 && lx < 10 && ly > 2 && ly < 8) return [140, 90, 40, 255];
    return [0, 0, 0, 0];
  });
  // 58 lamp
  fillTile(d, 58, (lx, ly, rnd) => {
    if (lx < 2 || ly < 2 || lx > 13 || ly > 13) return [40, 40, 40, 255];
    return [255, 220, 100, 255];
  });
  // 59 pressure plate
  fillTile(d, 59, (lx, ly) => {
    if (ly > 10) return [160, 160, 160, 255];
    return [0, 0, 0, 0];
  });
  // 60 helstein (netherrack-like)
  fillTile(d, 60, (lx, ly, rnd) => {
    const v = 80 + (rnd * 40) | 0;
    return [v, v >> 2, v >> 2, 255];
  });
  // 61 sjelegrus
  fillTile(d, 61, (lx, ly, rnd) => {
    const v = 30 + (rnd * 25) | 0;
    return [v, v + 10, v + 20, 255];
  });
  // 62 portal
  fillTile(d, 62, (lx, ly, rnd) => {
    const v = 80 + ((lx + ly + rnd * 40) % 100) | 0;
    return [v, 20, v + 40, 200];
  });
  // 63 portal frame
  fillTile(d, 63, (lx, ly) => {
    if ((lx + ly) % 4 < 2) return [20, 80, 70, 255];
    return [10, 50, 45, 255];
  });
  // 64 lava
  fillTile(d, 64, (lx, ly, rnd) => {
    const v = 180 + (rnd * 60) | 0;
    const g = 40 + ((lx + ly) % 5) * 8;
    return [v, g, 10, 230];
  });
  // 65 glødstein
  fillTile(d, 65, (lx, ly, rnd) => {
    if ((lx + ly) % 3 === 0) return [255, 240, 160, 255];
    return [220 + (rnd * 30) | 0, 180, 60, 255];
  });
  // 66 helkvarts
  fillTile(d, 66, (lx, ly, rnd) => {
    const v = 210 + (rnd * 30) | 0;
    if ((lx % 4 === 0) || (ly % 4 === 0)) return [v - 30, v - 30, v - 10, 255];
    return [v, v, v - 5, 255];
  });
  // 67 anvil
  fillTile(d, 67, (lx, ly) => {
    if (ly < 4 || ly > 12) return [70, 70, 75, 255];
    if (lx < 2 || lx > 13) return [50, 50, 55, 255];
    return [110, 110, 120, 255];
  });
  // 68 bone item
  fillTile(d, 68, (lx, ly) => {
    if (Math.abs(lx - 8) < 2 && ly > 1 && ly < 14) return [240, 235, 210, 255];
    if ((ly < 4 || ly > 11) && Math.abs(lx - 8) < 4) return [230, 220, 190, 255];
    return [0, 0, 0, 0];
  });
  // 69 powered red dust
  fillTile(d, 69, (lx, ly) => {
    if (Math.abs(lx - 8) < 3 || Math.abs(ly - 8) < 3) return [255, 80, 60, 255];
    return [0, 0, 0, 0];
  });
  // 70 lit lamp
  fillTile(d, 70, (lx, ly) => {
    if (lx < 2 || ly < 2 || lx > 13 || ly > 13) return [60, 50, 20, 255];
    return [255, 250, 180, 255];
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
