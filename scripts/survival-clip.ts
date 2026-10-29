/** Short headed-ish survival clip for it10 media */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  return new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)); });
  });
}
async function main() {
  fs.mkdirSync('public/progress/it10', { recursive: true });
  fs.mkdirSync('/workspace/blokkverden-shots/it10', { recursive: true });
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'pipe' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await sleep(200); }
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: '/tmp/bv-vid', size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept('ClipVerden');
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
  await sleep(500);
  await page.screenshot({ path: 'public/progress/it10/pt-00-spawn.png' });
  // Walk, look, punch tree setup
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const px = Math.floor(bv.player.x), py = Math.floor(bv.player.y), pz = Math.floor(bv.player.z);
    bv.world.setBlock(px + 2, py - 1, pz, 1);
    bv.world.setBlock(px + 2, py, pz, 5);
    bv.world.setBlock(px + 2, py + 1, pz, 5);
    bv.teleport(px + 0.5, py, pz + 0.5);
    bv.lookAt(px + 2.5, py + 1.2, pz + 0.5);
  });
  await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW');
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      const px = Math.floor(bv.player.x), py = Math.floor(bv.player.y), pz = Math.floor(bv.player.z);
      bv.lookAt(px + 2.5, py + 1.2, pz + 0.5);
    });
    await sleep(200);
  }
  await page.mouse.up();
  await page.screenshot({ path: 'public/progress/it10/pt-03-survival.png' });
  await page.keyboard.press('KeyE'); await sleep(600);
  await page.screenshot({ path: 'public/progress/it10/pt-04-inventar.png' });
  await page.keyboard.press('KeyE'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(400);
  await page.screenshot({ path: 'public/progress/it10/pt-05-pause.png' });
  await page.locator('#p-resume').click().catch(() => {});
  await sleep(1000);
  await context.close();
  await browser.close();
  child.kill('SIGTERM');
  // Move video
  const vids = fs.readdirSync('/tmp/bv-vid').filter((f) => f.endsWith('.webm'));
  if (vids[0]) {
    fs.copyFileSync(`/tmp/bv-vid/${vids[0]}`, 'public/progress/it10/clip-survival.webm');
    fs.copyFileSync('public/progress/it10/clip-survival.webm', '/workspace/blokkverden-shots/it10/clip-survival.webm');
    console.log('webm', vids[0]);
  }
  for (const f of ['pt-00-spawn.png', 'pt-03-survival.png', 'pt-04-inventar.png', 'pt-05-pause.png']) {
    if (fs.existsSync('public/progress/it10/' + f))
      fs.copyFileSync('public/progress/it10/' + f, '/workspace/blokkverden-shots/it10/' + f);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
