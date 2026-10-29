import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  return new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)); });
  });
}
async function main() {
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'pipe' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await sleep(200); }
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept('Dbg');
    else if (d.type() === 'confirm') await d.dismiss();
    else await d.accept();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#btn-single').click(); await sleep(300);
  await page.locator('#btn-new-world').click();
  await page.waitForSelector('canvas#game');
  for (let i = 0; i < 80; i++) { if (await page.evaluate(() => !!(window as any).__bv)) break; await sleep(250); }
  await page.mouse.move(640, 360);
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 }, force: true });
  await sleep(400);
  console.log('aim', await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = 118; x <= 128; x++) for (let z = 118; z <= 128; z++) {
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 50; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.world.setBlock(123, 47, 122, 5); // log at eye height
    bv.teleport(123.5, 46.05, 124.5);
    bv.lookAt(123.5, 47.5, 122.5);
    return { hit: bv.targetHit(), block: bv.world.getBlock(123, 47, 122), yaw: bv.player.yaw, pitch: bv.player.pitch };
  }));
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => (window as any).__bv.lookAt(123.5, 47.5, 122.5));
    await sleep(150);
    console.log('dig', i, await page.evaluate(() => ({
      b: (window as any).__bv.world.getBlock(123, 47, 122),
      hit: (window as any).__bv.targetHit(),
      bh: (window as any).__bv.input.breakHeld,
    })));
  }
  await page.mouse.up();
  await browser.close(); child.kill('SIGTERM');
}
main().catch((e) => { console.error(e); process.exit(1); });
