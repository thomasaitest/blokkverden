/**
 * Retake partial-k6-shelter (must show shelter+torch) and partial-i2-night (hostiles visible).
 * Real keyboard/mouse; __bv for setup only.
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = 'public/progress/it11';
const IT10 = 'public/progress/it10';
const SHOTS = '/workspace/blokkverden-shots/it11';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      if (a && typeof a === 'object') { const p = a.port; s.close(() => resolve(p)); }
      else reject(new Error('port'));
    });
  });
}

async function startPreview() {
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, child }; } catch {}
    await sleep(200);
  }
  throw new Error('preview failed');
}

async function boot(page: Page, base: string, name: string) {
  page.removeAllListeners('dialog');
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept(name);
    else if (d.type() === 'confirm') await d.dismiss();
    else await d.accept();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('#btn-single').click();
  await sleep(300);
  await page.locator('#btn-new-world').click();
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => !!(window as any).__bv)) break;
    await sleep(250);
  }
  if (!(await page.evaluate(() => !!(window as any).__bv))) throw new Error('__bv not ready');
  await sleep(400);
}

async function acquireLock(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => (document.getElementById('game') as HTMLElement | null)?.focus());
  await page.mouse.move(640, 360);
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 }, force: true });
  await sleep(250);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(IT10, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, type: 'png' });
  fs.copyFileSync(p, path.join(IT10, name));
  fs.copyFileSync(p, path.join(SHOTS, name));
  console.log('shot', name, fs.statSync(p).size);
}

async function main() {
  // Ensure build exists
  const { base, child } = await startPreview();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, base, 'It11Shots');
  await acquireLock(page);

  // ── K6: build visible shelter + torch, look at it from outside ──
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const x = 80, y = 48, z = 80;
    // Clear area + grass pad
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 8; dz++) {
      for (let dy = 0; dy <= 6; dy++) bv.world.setBlock(x + dx, y + dy, z + dz, 0);
      bv.world.setBlock(x + dx, y - 1, z + dz, 1); // grass
    }
    // Cobble/plank hut 5x5
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      bv.world.setBlock(x + dx, y - 1, z + dz, 4); // cobble floor
      for (let dy = 0; dy <= 2; dy++) {
        const wall = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        bv.world.setBlock(x + dx, y + dy, z + dz, wall ? 6 : 0);
      }
      bv.world.setBlock(x + dx, y + 3, z + dz, 6); // roof
    }
    // Door hole facing +Z (toward camera)
    bv.world.setBlock(x, y, z + 2, 0);
    bv.world.setBlock(x, y + 1, z + 2, 0);
    // Torch inside + one on front wall
    bv.world.setBlock(x, y + 2, z, 12);
    bv.world.setBlock(x, y + 2, z + 2, 12);
    bv.inv.slots[0] = { id: 12, count: 8 };
    bv.inv.selected = 0;
    bv.hud.refreshHotbar();
    // Camera outside looking at doorway
    bv.teleport(x + 0.5, y, z + 5.5);
    bv.lookAt(x + 0.5, y + 1.5, z + 0.5);
    bv.setDay(0.72); // dusk so torch glow visible
  });
  await sleep(800);
  // Step closer with real W
  await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW');
  await sleep(300);
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.lookAt(80.5, 49.5, 80.5);
  });
  await sleep(200);
  await shot(page, 'partial-k6-shelter.png');

  // ── I2: night + hostiles clearly in view ──
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const x = 100, y = 50, z = 100;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      for (let dy = 0; dy <= 5; dy++) bv.world.setBlock(x + dx, y + dy, z + dz, 0);
      bv.world.setBlock(x + dx, y - 1, z + dz, 3);
    }
    bv.clearMobs();
    bv.setDay(0.92);
    // Spawn several hostiles in front of camera
    const kinds = ['vandrer', 'bueskytt', 'vever', 'knallbolle'];
    for (let i = 0; i < 4; i++) {
      bv.mobs.spawn(kinds[i], x - 2 + i * 1.5, y, z - 4);
    }
    bv.teleport(x + 0.5, y, z + 2.5);
    bv.lookAt(x + 0.5, y + 1.2, z - 3);
    bv.player.hunger = 16;
    bv.hud.refreshHotbar();
  });
  await sleep(600);
  // Wait for natural extras + ensure hostiles still there
  let hostiles = 0;
  for (let i = 0; i < 10; i++) {
    hostiles = await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.mobs.spawnCool = 0;
      return bv.mobs.mobs.filter((m: any) => m.hostile).length;
    });
    if (hostiles >= 3) break;
    await sleep(400);
  }
  console.log('hostiles in view setup:', hostiles);
  // Nudge look with mouse-free lookAt again
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const m = bv.mobs.mobs.find((mm: any) => mm.hostile);
    if (m) bv.lookAt(m.x, m.y + 1.0, m.z);
  });
  await sleep(300);
  await shot(page, 'partial-i2-night.png');

  const state = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return {
      hostiles: bv.mobs.mobs.filter((m: any) => m.hostile).map((m: any) => m.kind),
      day: bv.getState().dayTime,
      torch: bv.world.getBlock(80, 50, 82) === 12 || bv.world.getBlock(80, 50, 80) === 12,
    };
  });
  console.log('verify', state);

  await browser.close();
  child.kill('SIGTERM');
  process.exit(hostiles >= 1 ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
